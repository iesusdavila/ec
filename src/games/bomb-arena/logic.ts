import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";
import {
  applyPadInput,
  clearPresses,
  createPadState,
  isHeld,
  takePress,
  type PadInput,
  type PadState,
} from "@/games/runtime/padInput";

/**
 * PÓLVORA — arena de bombas por casillas.
 *
 * Es deliberadamente lo contrario de Torre infinita: allí manda el reflejo y el
 * salto, aquí manda pensar dos movimientos por delante. Se comparte una arena
 * cerrada, se rompen bloques para abrirse paso, aparecen mejoras y se intenta
 * dejar al otro sin salida. El mando son cuatro flechas y un botón.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ MOVIMIENTO POR CASILLAS Y NO LIBRE
 *
 * El movimiento libre en una rejilla obliga a resolver a mano el problema de
 * "casi entro por el pasillo": el jugador apunta a un hueco de una casilla, se
 * queda pegado a una esquina por dos píxeles y muere por algo que no entiende.
 * Los juegos del género lo arreglan con reglas de deslizamiento en las esquinas,
 * que son difíciles de afinar y peor aún con una red de por medio.
 *
 * Aquí el jugador va SIEMPRE de centro a centro de casilla, interpolando la
 * posición para que se vea suave. Nunca te quedas encajado en una esquina, lo
 * que ves en la pantalla coincide exactamente con la casilla en la que estás
 * —que es lo que decide si te alcanza una explosión—, y el mando tolera de
 * sobra las decenas de milisegundos que tarda un botón en llegar por Pusher.
 * ---------------------------------------------------------------------------
 */

export const GRID_W = 13;
export const GRID_H = 11;

/** Casillas por segundo, y lo que suma cada mejora de velocidad. */
const BASE_SPEED = 3.4;
const SPEED_PER_UPGRADE = 0.65;
const MAX_SPEED = 6;

const FUSE_MS = 2400;
const BLAST_MS = 480;
const BASE_RANGE = 2;
const MAX_RANGE = 7;
const MAX_BOMBS = 6;

/** Probabilidad de que un bloque roto esconda una mejora. */
const POWERUP_CHANCE = 0.33;
/** Densidad de bloques rompibles en las casillas libres. */
const BRICK_DENSITY = 0.72;

/**
 * Muerte súbita: a partir de qué fracción de la ronda empieza a cerrarse la
 * arena, y cada cuánto cae un bloque.
 *
 * Sin esto, dos jugadores prudentes se pasan la ronda entera esquivándose en
 * una arena ya vacía y la partida se decide por el reloj, que es la forma más
 * sosa de terminar. Cerrando la arena en espiral, el final siempre es un
 * enfrentamiento.
 */
const SUDDEN_DEATH_AT = 0.68;
const SUDDEN_DEATH_STEP_MS = 360;

export type Cell = "empty" | "wall" | "brick";
export type PowerUp = "bomb" | "fire" | "speed";
export type Direction = "up" | "down" | "left" | "right";

export interface BombState {
  id: number;
  cx: number;
  cy: number;
  ownerId: string;
  range: number;
  explodesAt: number;
}

export interface BlastCell {
  cx: number;
  cy: number;
  until: number;
  /** Para dibujar: el centro se ve distinto de los brazos. */
  center: boolean;
}

export interface DroppedPowerUp {
  cx: number;
  cy: number;
  kind: PowerUp;
}

export interface BomberPlayer {
  id: string;
  /** Casilla actual. Es la que decide si una explosión te alcanza. */
  cx: number;
  cy: number;
  /** Casilla hacia la que se está moviendo, y cuánto lleva del trayecto. */
  tx: number;
  ty: number;
  progress: number;
  facing: Direction;
  alive: boolean;
  /** Momento en que murió, para ordenar el ranking. */
  diedAt: number | null;
  maxBombs: number;
  range: number;
  speed: number;
  bricksDestroyed: number;
  kills: number;
}

export interface BombArenaState {
  phase: "playing" | "gameover";
  elapsedMs: number;
  durationMs: number;
  /** Fila mayor primero: `grid[cy * GRID_W + cx]`. */
  grid: Cell[];
  bombs: BombState[];
  blasts: BlastCell[];
  powerups: DroppedPowerUp[];
  players: BomberPlayer[];
  suddenDeath: boolean;
}

/** Lo único que el teléfono necesita saber: si sigue vivo. */
export interface BombArenaPlayerState {
  alive: Record<string, boolean>;
  over: boolean;
}

export function bombArenaToPlayerState(state: unknown): BombArenaPlayerState {
  const arena = state as BombArenaState;
  return {
    alive: Object.fromEntries(arena.players.map((p) => [p.id, p.alive])),
    over: arena.phase === "gameover",
  };
}

const SPAWNS: { cx: number; cy: number }[] = [
  { cx: 1, cy: 1 },
  { cx: GRID_W - 2, cy: GRID_H - 2 },
  { cx: GRID_W - 2, cy: 1 },
  { cx: 1, cy: GRID_H - 2 },
];

const DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function index(cx: number, cy: number): number {
  return cy * GRID_W + cx;
}

function inside(cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H;
}

/**
 * Orden en espiral hacia dentro de las casillas jugables.
 * Es el recorrido con el que la muerte súbita va cerrando la arena.
 */
function spiralOrder(): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  let top = 1;
  let bottom = GRID_H - 2;
  let left = 1;
  let right = GRID_W - 2;
  while (top <= bottom && left <= right) {
    for (let cx = left; cx <= right; cx++) out.push({ cx, cy: top });
    for (let cy = top + 1; cy <= bottom; cy++) out.push({ cx: right, cy });
    if (top < bottom) for (let cx = right - 1; cx >= left; cx--) out.push({ cx, cy: bottom });
    if (left < right) for (let cy = bottom - 1; cy > top; cy--) out.push({ cx: left, cy });
    top++;
    bottom--;
    left++;
    right--;
  }
  return out;
}

export function createBombArenaEngine(context: GameEngineContext): GameEngine<PadInput> {
  const durationMs = (context.options.roundValue || 120) * 1000;
  const pads = new Map<string, PadState>();
  let bombId = 0;
  let now = 0;
  let suddenDeathIndex = 0;
  let nextSuddenDeathAt = 0;
  const spiral = spiralOrder();

  // --- Arena ---------------------------------------------------------------
  const grid: Cell[] = new Array(GRID_W * GRID_H).fill("empty");
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const border = cx === 0 || cy === 0 || cx === GRID_W - 1 || cy === GRID_H - 1;
      // Pilares fijos en las casillas pares: son los que dan a la arena su
      // forma de laberinto y evitan pasillos rectos de lado a lado.
      const pillar = cx % 2 === 0 && cy % 2 === 0;
      if (border || pillar) grid[index(cx, cy)] = "wall";
    }
  }

  // Los alrededores de cada salida se dejan despejados: nadie debe empezar
  // encerrado ni obligado a gastar su primera bomba para poder moverse.
  const safe = new Set<number>();
  for (const spawn of SPAWNS.slice(0, Math.max(2, context.players.length))) {
    safe.add(index(spawn.cx, spawn.cy));
    for (const { dx, dy } of Object.values(DELTAS)) {
      const cx = spawn.cx + dx;
      const cy = spawn.cy + dy;
      if (inside(cx, cy)) safe.add(index(cx, cy));
    }
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== "empty" || safe.has(i)) continue;
    if (Math.random() < BRICK_DENSITY) grid[i] = "brick";
  }

  const state: BombArenaState = {
    phase: "playing",
    elapsedMs: 0,
    durationMs,
    grid,
    bombs: [],
    blasts: [],
    powerups: [],
    suddenDeath: false,
    players: context.players.map((player, i) => {
      const spawn = SPAWNS[i % SPAWNS.length];
      return {
        id: player.id,
        cx: spawn.cx,
        cy: spawn.cy,
        tx: spawn.cx,
        ty: spawn.cy,
        progress: 0,
        facing: "down" as Direction,
        alive: true,
        diedAt: null,
        maxBombs: 1,
        range: BASE_RANGE,
        speed: BASE_SPEED,
        bricksDestroyed: 0,
        kills: 0,
      };
    }),
  };

  function emit(): void {
    context.onStateChange(state);
  }

  function padFor(playerId: string): PadState {
    let pad = pads.get(playerId);
    if (!pad) {
      pad = createPadState();
      pads.set(playerId, pad);
    }
    return pad;
  }

  function bombAt(cx: number, cy: number): BombState | undefined {
    return state.bombs.find((b) => b.cx === cx && b.cy === cy);
  }

  /**
   * ¿Puede este jugador entrar en esa casilla?
   *
   * La excepción de la bomba es la regla clásica del género y hace falta: al
   * poner una bomba estás encima de ella, y si bloqueara de inmediato te
   * matarías tú solo cada vez. Bloquea en cuanto te has bajado.
   */
  function walkable(player: BomberPlayer, cx: number, cy: number): boolean {
    if (!inside(cx, cy)) return false;
    if (grid[index(cx, cy)] !== "empty") return false;
    const bomb = bombAt(cx, cy);
    if (bomb && !(player.cx === cx && player.cy === cy)) return false;
    return true;
  }

  function placeBomb(player: BomberPlayer): void {
    const active = state.bombs.filter((b) => b.ownerId === player.id).length;
    if (active >= player.maxBombs) return;
    if (bombAt(player.cx, player.cy)) return;
    state.bombs.push({
      id: bombId++,
      cx: player.cx,
      cy: player.cy,
      ownerId: player.id,
      range: player.range,
      explodesAt: now + FUSE_MS,
    });
  }

  function takePowerUp(player: BomberPlayer): void {
    const i = state.powerups.findIndex((p) => p.cx === player.cx && p.cy === player.cy);
    if (i === -1) return;
    const [powerup] = state.powerups.splice(i, 1);
    if (powerup.kind === "bomb") player.maxBombs = Math.min(MAX_BOMBS, player.maxBombs + 1);
    if (powerup.kind === "fire") player.range = Math.min(MAX_RANGE, player.range + 1);
    if (powerup.kind === "speed") player.speed = Math.min(MAX_SPEED, player.speed + SPEED_PER_UPGRADE);
  }

  function stepPlayer(player: BomberPlayer, dtS: number): void {
    if (!player.alive) return;
    const pad = padFor(player.id);

    if (takePress(pad, "bomb")) placeBomb(player);

    if (player.progress > 0) {
      player.progress += player.speed * dtS;
      if (player.progress >= 1) {
        player.cx = player.tx;
        player.cy = player.ty;
        player.progress = 0;
        takePowerUp(player);
      }
      return;
    }

    // Parado: si hay una dirección pulsada y la casilla siguiente es
    // transitable, se empieza el paso. Se mira en el orden en que se listan,
    // así que pulsar dos a la vez elige una y no bloquea al jugador.
    for (const direction of ["up", "down", "left", "right"] as Direction[]) {
      if (!isHeld(pad, direction)) continue;
      player.facing = direction;
      const { dx, dy } = DELTAS[direction];
      const nx = player.cx + dx;
      const ny = player.cy + dy;
      if (!walkable(player, nx, ny)) continue;
      player.tx = nx;
      player.ty = ny;
      player.progress = 0.0001;
      return;
    }
  }

  /** Explota una bomba y, en cadena, las que alcance. */
  function detonate(bomb: BombState, chain: Set<number>): void {
    if (chain.has(bomb.id)) return;
    chain.add(bomb.id);

    const owner = state.players.find((p) => p.id === bomb.ownerId);
    const until = now + BLAST_MS;
    const touched: { cx: number; cy: number; center: boolean }[] = [
      { cx: bomb.cx, cy: bomb.cy, center: true },
    ];

    for (const { dx, dy } of Object.values(DELTAS)) {
      for (let step = 1; step <= bomb.range; step++) {
        const cx = bomb.cx + dx * step;
        const cy = bomb.cy + dy * step;
        if (!inside(cx, cy)) break;
        const cell = grid[index(cx, cy)];
        if (cell === "wall") break;
        touched.push({ cx, cy, center: false });
        if (cell === "brick") {
          grid[index(cx, cy)] = "empty";
          if (owner) owner.bricksDestroyed += 1;
          if (Math.random() < POWERUP_CHANCE) {
            const kinds: PowerUp[] = ["bomb", "fire", "speed"];
            state.powerups.push({ cx, cy, kind: kinds[Math.floor(Math.random() * kinds.length)] });
          }
          // El fuego se para en el primer bloque que rompe: si no, una sola
          // bomba con alcance largo limpiaría media arena de una vez.
          break;
        }
      }
    }

    for (const cell of touched) {
      state.blasts.push({ cx: cell.cx, cy: cell.cy, until, center: cell.center });
      // Una mejora alcanzada por el fuego se pierde: si no, reventar bloques a
      // lo bruto sería siempre la mejor jugada, sin ningún riesgo.
      const p = state.powerups.findIndex((u) => u.cx === cell.cx && u.cy === cell.cy);
      if (p !== -1) state.powerups.splice(p, 1);

      // Detonación en cadena.
      const other = bombAt(cell.cx, cell.cy);
      if (other && other.id !== bomb.id) detonate(other, chain);
    }

    state.bombs = state.bombs.filter((b) => b.id !== bomb.id);
  }

  function killAt(cx: number, cy: number, blamedOn: string | null): void {
    for (const player of state.players) {
      if (!player.alive) continue;
      if (player.cx !== cx || player.cy !== cy) continue;
      player.alive = false;
      player.diedAt = now;
      if (blamedOn && blamedOn !== player.id) {
        const killer = state.players.find((p) => p.id === blamedOn);
        if (killer) killer.kills += 1;
      }
    }
  }

  function runSuddenDeath(): void {
    if (state.elapsedMs < durationMs * SUDDEN_DEATH_AT) return;
    if (!state.suddenDeath) {
      state.suddenDeath = true;
      nextSuddenDeathAt = now;
    }
    while (now >= nextSuddenDeathAt && suddenDeathIndex < spiral.length) {
      const cell = spiral[suddenDeathIndex++];
      nextSuddenDeathAt += SUDDEN_DEATH_STEP_MS;
      if (grid[index(cell.cx, cell.cy)] === "wall") continue;
      grid[index(cell.cx, cell.cy)] = "wall";
      // Lo que hubiera en esa casilla desaparece: mejoras, bombas y jugadores.
      state.bombs = state.bombs.filter((b) => !(b.cx === cell.cx && b.cy === cell.cy));
      state.powerups = state.powerups.filter((u) => !(u.cx === cell.cx && u.cy === cell.cy));
      killAt(cell.cx, cell.cy, null);
      // Un jugador que iba EN CAMINO a esa casilla no puede seguir hacia ella.
      for (const player of state.players) {
        if (player.alive && player.progress > 0 && player.tx === cell.cx && player.ty === cell.cy) {
          player.tx = player.cx;
          player.ty = player.cy;
          player.progress = 0;
        }
      }
    }
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      if (state.phase !== "playing") return;
      applyPadInput(padFor(playerId), input);
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      const dt = Math.min(dtMs, 50);
      now += dt;
      state.elapsedMs += dtMs;

      for (const player of state.players) stepPlayer(player, dt / 1000);
      for (const pad of pads.values()) clearPresses(pad);

      // Mechas.
      const chain = new Set<number>();
      for (const bomb of [...state.bombs]) {
        if (now >= bomb.explodesAt) detonate(bomb, chain);
      }

      // El fuego mata mientras dura: no basta con mirar el instante de la
      // explosión, porque un jugador puede meterse en la llama después.
      state.blasts = state.blasts.filter((blast) => blast.until > now);
      for (const blast of state.blasts) {
        killAt(blast.cx, blast.cy, null);
      }

      runSuddenDeath();

      const alive = state.players.filter((p) => p.alive);
      const soloEnd = state.players.length > 1 && alive.length <= 1;
      if (soloEnd || alive.length === 0 || state.elapsedMs >= durationMs) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const score = (p: BomberPlayer) => p.bricksDestroyed + p.kills * 25 + (p.alive ? 60 : 0);
      const ranking = [...state.players].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        // Entre eliminados, gana el que aguantó más.
        if (!a.alive && !b.alive) {
          const diff = (b.diedAt ?? 0) - (a.diedAt ?? 0);
          if (diff !== 0) return diff;
        }
        return score(b) - score(a);
      });
      return {
        ranking: ranking.map((p) => p.id),
        scores: Object.fromEntries(state.players.map((p) => [p.id, score(p)])),
        winnerId: ranking[0]?.id ?? null,
      };
    },

    cleanup: () => {
      pads.clear();
    },
  };
}

/** Posición en casillas interpolada, para dibujar sin saltos. */
export function bomberPosition(player: BomberPlayer): { x: number; y: number } {
  const t = Math.min(1, player.progress);
  return {
    x: player.cx + (player.tx - player.cx) * t,
    y: player.cy + (player.ty - player.cy) * t,
  };
}
