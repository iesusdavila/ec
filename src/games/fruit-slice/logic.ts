import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const BASE_ROUND_MS = 45000;
const SPAWN_MIN_MS_START = 700;
const SPAWN_MAX_MS_START = 1150;
const SPAWN_MIN_MS_END = 420;
const SPAWN_MAX_MS_END = 750;
/**
 * Vida de un objeto = duración completa de su arco. Antes eran 2000 ms, un
 * ritmo pensado para "agitar el teléfono" (no había que apuntar a nada). Con
 * puntería real hace falta más tiempo de vuelo: a 2 s el objeto recorría el
 * arco tan rápido que, con la latencia de red, ya se había movido fuera del
 * radio de corte antes de que el toque llegara al monitor.
 */
export const OBJECT_LIFETIME_MS = 2900;
/** Cuánto se deja el objeto en pantalla tras ser cortado, para la animación. */
export const SLICE_LINGER_MS = 450;
const POPUP_LIFETIME_MS = 750;
const BOMB_CHANCE = 0.2;
const FRUIT_POINTS = 10;
const BOMB_PENALTY = 10;

/**
 * Radio (en fracción del escenario) alrededor del punto/trazo del jugador
 * dentro del cual un corte alcanza a un objeto.
 *
 * El bug original: `handleInput` ignoraba la puntería y cortaba "el primer
 * objeto vivo del carril", así que una bomba junto a una fruta se cortaba sí o
 * sí. Ahora todo corte es posicional; este radio es la tolerancia.
 */
const SLICE_RADIUS = 0.19;
/**
 * Compensación de latencia. El jugador reacciona a lo que ve en el monitor,
 * pero su toque tarda en llegar (teléfono -> Pusher -> monitor). Para no
 * castigarlo por ese retardo, cada objeto se evalúa también en las posiciones
 * que ocupaba unos ms antes: si el trazo pasó por donde el jugador lo veía,
 * cuenta como acierto.
 */
const LAG_SAMPLES_MS = [0, 90, 180];
/**
 * Velocidad mínima del cursor (fracciones de escenario por segundo) para que
 * un movimiento cuente como "barrido" que corta. Mover el puntero despacio
 * para recolocarlo NO corta: así se puede pasar junto a una bomba sin
 * detonarla, y hace falta un gesto decidido para cortar (como en el juego
 * clásico de cortar fruta).
 */
const SWIPE_MIN_SPEED = 1.0;
/**
 * Constante de tiempo del suavizado del cursor en el monitor.
 *
 * Ojo con bajarla o subirla a lo tonto: ya NO es lo que da la sensación de
 * fluidez (de eso se encarga la extrapolación de abajo), solo absorbe el
 * salto cuando llega una posición nueva y la predicción se había desviado un
 * poco. Un valor pequeño = más nervioso pero más pegado a la mano.
 */
const CURSOR_EASE_TAU_MS = 38;
/**
 * Extrapolación ("dead reckoning"), que es lo que hace que el puntero se vea
 * fluido con solo ~8 mensajes por segundo.
 *
 * Interpolar hacia la última posición recibida tiene un techo: el cursor
 * SIEMPRE va por detrás, porque persigue un punto que ya es viejo. Por eso
 * subir la frecuencia de envío se sentía como la única salida... y no se puede,
 * Pusher corta a 10 msg/s (§7.5 del HANDOFF).
 *
 * La solución es la de cualquier juego en red: el teléfono manda también su
 * VELOCIDAD, y el monitor avanza el cursor por su cuenta entre mensaje y
 * mensaje. Así el punto se dibuja donde la mano está AHORA, no donde estaba
 * hace 120 ms, y se ve continuo sin gastar un solo mensaje más.
 *
 * El tope evita que, si los mensajes dejan de llegar (red o mano parada), el
 * cursor siga viajando solo hasta el borde.
 */
const MAX_EXTRAPOLATION_MS = 200;
/** Cuánto recuerda el monitor el último acierto/fallo de un cursor (anillo). */
export const CURSOR_FX_MS = 260;

export const FRUIT_KINDS = ["apple", "watermelon", "orange", "banana"] as const;
export type FruitKind = (typeof FRUIT_KINDS)[number];
export type ObjectKind = FruitKind | "bomb";

/**
 * Entrada del jugador:
 * - `aim`: nueva posición del puntero. Además de mover el cursor, el tramo
 *   recorrido desde la posición anterior corta lo que atraviese (si el gesto
 *   fue lo bastante rápido).
 * - `slice`: corte explícito en un punto (toque en la pantalla del teléfono).
 *   Lleva sus propias coordenadas para no depender de que el último `aim` haya
 *   llegado antes por la red.
 */
export type FruitSliceInput =
  /** `vx`/`vy`: velocidad en fracciones de escenario por segundo, para que el
   *  monitor pueda extrapolar entre mensajes (ver MAX_EXTRAPOLATION_MS). */
  | { type: "aim"; x: number; y: number; vx: number; vy: number }
  | { type: "slice"; x: number; y: number };

export interface FallingObject {
  id: number;
  kind: ObjectKind;
  x: number; // 0..1, posición horizontal dentro de su carril
  spawnedAt: number;
  sliced: boolean;
  slicedAt: number | null;
  slicedBy: string | null;
}

export interface ScorePopup {
  id: number;
  laneIndex: number;
  x: number;
  y: number;
  amount: number;
  spawnedAt: number;
}

export interface PlayerCursor {
  playerId: string;
  /** Índice del carril en el que apunta este jugador. */
  laneIndex: number;
  /** Posición dibujada: se interpola hacia el objetivo en cada tick. */
  x: number;
  y: number;
  /** Última posición recibida del teléfono (el objetivo real). */
  targetX: number;
  targetY: number;
  /** Velocidad reportada por el teléfono, en fracciones por segundo. */
  velX: number;
  velY: number;
  /** `elapsed` del último `aim`: edad de la muestra y velocidad del barrido. */
  lastAimAt: number;
  /** `elapsed` ms del último corte acertado (anillo verde del monitor). */
  lastHitAt: number | null;
  /** `elapsed` ms del último corte al aire (anillo gris). */
  lastMissAt: number | null;
  /** Extremos del último trazo que cortó, para dibujar la estela. */
  trail: { ax: number; ay: number; bx: number; by: number; at: number } | null;
}

export interface FruitLane {
  /** Jugadores dueños de este carril. En modo compartido, todos comparten uno solo. */
  playerIds: string[];
  objects: FallingObject[];
  /** Momento (elapsed ms) del último impacto de bomba, para el efecto visual. */
  lastBombAt: number | null;
}

export interface FruitSliceState {
  phase: "playing" | "gameover";
  /** Tiempo transcurrido (ms) desde el inicio de la ronda; usado por el monitor para animar. */
  now: number;
  durationMs: number;
  remainingMs: number;
  splitScreen: boolean;
  lanes: FruitLane[];
  /** Cursor de cada jugador, indexado por su id. */
  cursors: Record<string, PlayerCursor>;
  popups: ScorePopup[];
  scores: Record<string, number>;
}

function randomFruitKind(): FruitKind {
  return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Altura del arco de un objeto según su progreso de vida (0..1).
 * `MonitorView` importa esta misma función: si el dibujo y el hit-test usaran
 * fórmulas distintas, el jugador apuntaría a un sitio y se cortaría en otro.
 */
export function arcY(progress: number): number {
  return 0.85 - 0.6 * Math.sin(clamp01(progress) * Math.PI);
}

/** Distancia de un punto al segmento AB (el trazo del puntero). */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function createFruitSliceEngine(
  context: GameEngineContext
): GameEngine<FruitSliceInput> {
  const durationMs = context.options.roundValue * 1000 || BASE_ROUND_MS;
  const splitScreen = context.options.splitScreen && context.players.length > 1;

  let elapsed = 0;
  let nextId = 1;
  let nextPopupId = 1;

  const lanes: FruitLane[] = splitScreen
    ? context.players.map((p) => ({ playerIds: [p.id], objects: [], lastBombAt: null }))
    : [{ playerIds: context.players.map((p) => p.id), objects: [], lastBombAt: null }];

  const laneIndexOf = (playerId: string) =>
    Math.max(0, lanes.findIndex((lane) => lane.playerIds.includes(playerId)));

  const nextSpawnAt = lanes.map(() => 0);

  const state: FruitSliceState = {
    phase: "playing",
    now: 0,
    durationMs,
    remainingMs: durationMs,
    splitScreen: Boolean(splitScreen),
    lanes,
    cursors: Object.fromEntries(
      context.players.map((p) => [
        p.id,
        {
          playerId: p.id,
          laneIndex: laneIndexOf(p.id),
          x: 0.5,
          y: 0.5,
          targetX: 0.5,
          targetY: 0.5,
          velX: 0,
          velY: 0,
          lastAimAt: 0,
          lastHitAt: null,
          lastMissAt: null,
          trail: null,
        } satisfies PlayerCursor,
      ])
    ),
    popups: [],
    scores: Object.fromEntries(context.players.map((p) => [p.id, 0])),
  };

  function emit() {
    context.onStateChange(state);
  }

  function laneForPlayer(playerId: string): { lane: FruitLane; index: number } | null {
    const index = state.lanes.findIndex((lane) => lane.playerIds.includes(playerId));
    if (index === -1) return null;
    return { lane: state.lanes[index], index };
  }

  function difficultyProgress(): number {
    return Math.min(1, elapsed / durationMs);
  }

  function scheduleSpawn(laneIndex: number) {
    const t = difficultyProgress();
    const min = SPAWN_MIN_MS_START + (SPAWN_MIN_MS_END - SPAWN_MIN_MS_START) * t;
    const max = SPAWN_MAX_MS_START + (SPAWN_MAX_MS_END - SPAWN_MAX_MS_START) * t;
    nextSpawnAt[laneIndex] = elapsed + min + Math.random() * (max - min);
  }

  function isAlive(o: FallingObject): boolean {
    return !o.sliced && elapsed - o.spawnedAt < OBJECT_LIFETIME_MS;
  }

  /** Altura del objeto en un instante dado (para compensar latencia). */
  function yAt(o: FallingObject, at: number): number {
    return arcY((at - o.spawnedAt) / OBJECT_LIFETIME_MS);
  }

  /**
   * Distancia mínima del objeto al trazo AB, mirando también dónde estaba el
   * objeto unos ms atrás: el jugador apuntó a lo que veía, no a lo que el
   * monitor ya había avanzado mientras su toque viajaba por la red.
   */
  function distanceToStroke(
    o: FallingObject,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    let best = Infinity;
    for (const lag of LAG_SAMPLES_MS) {
      const d = distanceToSegment(o.x, yAt(o, elapsed - lag), ax, ay, bx, by);
      if (d < best) best = d;
    }
    return best;
  }

  function registerSlice(
    playerId: string,
    cursor: PlayerCursor,
    lane: FruitLane,
    laneIndex: number,
    target: FallingObject,
    atX: number,
    atY: number
  ) {
    target.sliced = true;
    target.slicedAt = elapsed;
    target.slicedBy = playerId;
    cursor.lastHitAt = elapsed;

    const amount = target.kind === "bomb" ? -BOMB_PENALTY : FRUIT_POINTS;
    state.scores[playerId] = (state.scores[playerId] ?? 0) + amount;
    if (target.kind === "bomb") {
      lane.lastBombAt = elapsed;
    }
    state.popups.push({
      id: nextPopupId++,
      laneIndex,
      x: atX,
      y: atY,
      amount,
      spawnedAt: elapsed,
    });
  }

  return {
    getState: () => state,

    start: () => {
      state.lanes.forEach((_, i) => scheduleSpawn(i));
      emit();
    },

    handleInput: (playerId, input) => {
      if (state.phase !== "playing") return;
      const cursor = state.cursors[playerId];
      if (!cursor) return;
      const found = laneForPlayer(playerId);
      if (!found) return;

      if (input.type === "aim") {
        const nx = clamp01(input.x);
        const ny = clamp01(input.y);
        const ax = cursor.targetX;
        const ay = cursor.targetY;
        const dtMs = Math.max(1, elapsed - cursor.lastAimAt);
        const dist = Math.hypot(nx - ax, ny - ay);
        const speed = dist / (dtMs / 1000);

        // Corte por barrido: el tramo recorrido corta todo lo que atraviesa,
        // siempre que el gesto sea decidido (ver SWIPE_MIN_SPEED).
        if (speed >= SWIPE_MIN_SPEED) {
          for (const o of found.lane.objects) {
            if (!isAlive(o)) continue;
            if (distanceToStroke(o, ax, ay, nx, ny) <= SLICE_RADIUS) {
              registerSlice(playerId, cursor, found.lane, found.index, o, o.x, yAt(o, elapsed));
            }
          }
          cursor.trail = { ax, ay, bx: nx, by: ny, at: elapsed };
        }

        cursor.targetX = nx;
        cursor.targetY = ny;
        cursor.velX = input.vx ?? 0;
        cursor.velY = input.vy ?? 0;
        cursor.lastAimAt = elapsed;
        emit();
        return;
      }

      // Toque explícito: corta el objeto más cercano al punto señalado.
      const px = clamp01(input.x);
      const py = clamp01(input.y);
      cursor.targetX = px;
      cursor.targetY = py;

      let best: FallingObject | undefined;
      let bestDist = SLICE_RADIUS;
      for (const o of found.lane.objects) {
        if (!isAlive(o)) continue;
        const d = distanceToStroke(o, px, py, px, py);
        if (d <= bestDist) {
          bestDist = d;
          best = o;
        }
      }

      if (!best) {
        // Corte al aire: sin penalización, solo un anillo tenue en el monitor.
        cursor.lastMissAt = elapsed;
        emit();
        return;
      }

      registerSlice(playerId, cursor, found.lane, found.index, best, px, py);
      emit();
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      elapsed += dtMs;
      state.now = elapsed;
      state.remainingMs = Math.max(0, durationMs - elapsed);

      // Cursor: se predice dónde está la mano ahora (última posición conocida
      // + velocidad × tiempo transcurrido desde esa muestra) y se suaviza el
      // acercamiento. Esto es lo que convierte ~8 mensajes por segundo en un
      // movimiento que se ve continuo y pegado a la mano.
      const ease = 1 - Math.exp(-dtMs / CURSOR_EASE_TAU_MS);
      for (const cursor of Object.values(state.cursors)) {
        const ageMs = Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, elapsed - cursor.lastAimAt));
        const aheadS = ageMs / 1000;
        const predictedX = clamp01(cursor.targetX + cursor.velX * aheadS);
        const predictedY = clamp01(cursor.targetY + cursor.velY * aheadS);
        cursor.x += (predictedX - cursor.x) * ease;
        cursor.y += (predictedY - cursor.y) * ease;
      }

      state.lanes.forEach((lane, i) => {
        if (elapsed >= nextSpawnAt[i]) {
          lane.objects.push({
            id: nextId++,
            kind: Math.random() < BOMB_CHANCE ? "bomb" : randomFruitKind(),
            x: 0.12 + Math.random() * 0.76,
            spawnedAt: elapsed,
            sliced: false,
            slicedAt: null,
            slicedBy: null,
          });
          scheduleSpawn(i);
        }

        lane.objects = lane.objects.filter((o) =>
          o.sliced
            ? elapsed - (o.slicedAt ?? elapsed) < SLICE_LINGER_MS
            : elapsed - o.spawnedAt < OBJECT_LIFETIME_MS
        );
      });

      state.popups = state.popups.filter((p) => elapsed - p.spawnedAt < POPUP_LIFETIME_MS);

      if (state.remainingMs <= 0) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = Object.keys(state.scores).sort((a, b) => state.scores[b] - state.scores[a]);
      return {
        ranking,
        scores: state.scores,
        winnerId: ranking[0] ?? null,
      };
    },

    cleanup: () => {},
  };
}
