import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const BASE_ROUND_MS = 45000;
const SPAWN_MIN_MS_START = 650;
const SPAWN_MAX_MS_START = 1100;
const SPAWN_MIN_MS_END = 350;
const SPAWN_MAX_MS_END = 650;
const OBJECT_LIFETIME_MS = 2000;
/** Cuánto se deja el objeto en pantalla tras ser cortado, para la animación. */
const SLICE_LINGER_MS = 450;
const POPUP_LIFETIME_MS = 750;
const BOMB_CHANCE = 0.2;
const FRUIT_POINTS = 10;
const BOMB_PENALTY = 10;

/**
 * Radio (en fracción del escenario, 0..1) alrededor del punto al que apunta el
 * teléfono dentro del cual un corte alcanza a un objeto.
 *
 * ANTES: `handleInput` ignoraba por completo dónde apuntaba el jugador y
 * cortaba "el primer objeto vivo del carril". Si en pantalla había una bomba y
 * una fruta a la vez, agitar el teléfono cortaba lo que hubiera aparecido
 * primero —normalmente la bomba—, sin que el jugador pudiera evitarlo.
 *
 * AHORA: el teléfono funciona como puntero. El jugador mueve un cursor con la
 * inclinación y el corte solo afecta al objeto más cercano a ese cursor y
 * dentro de este radio. Apuntar a la fruta y no a la bomba vuelve a depender
 * del jugador, que es lo que se espera del juego.
 */
const SLICE_RADIUS = 0.16;
/**
 * El escenario tiene relación de aspecto 4/3, así que una misma fracción
 * recorrida en vertical son menos píxeles que en horizontal. Se corrige la
 * distancia en Y por este factor para que la zona de corte sea un círculo real
 * en pantalla y no una elipse.
 */
const STAGE_ASPECT_CORRECTION = 3 / 4;
/** Cuánto recuerda el monitor el último acierto/fallo de un cursor (anillo). */
export const CURSOR_FX_MS = 260;

export const FRUIT_KINDS = ["apple", "watermelon", "orange", "banana"] as const;
export type FruitKind = (typeof FRUIT_KINDS)[number];
export type ObjectKind = FruitKind | "bomb";

/**
 * Entrada del jugador:
 * - `aim`: mueve el cursor (se envía de forma continua mientras el jugador
 *   inclina el teléfono).
 * - `slice`: ejecuta un corte EN el punto indicado (un toque en la pantalla
 *   del teléfono). Lleva sus propias coordenadas para no depender de que el
 *   último `aim` haya llegado antes por la red.
 */
export type FruitSliceInput =
  | { type: "aim"; x: number; y: number }
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
  x: number; // 0..1 dentro del escenario del carril
  y: number; // 0..1
  /** `elapsed` ms del último corte acertado (para el anillo verde del monitor). */
  lastHitAt: number | null;
  /** `elapsed` ms del último corte al aire (sin objeto bajo el cursor). */
  lastMissAt: number | null;
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
 * Altura del arco parabólico de un objeto en función de su progreso de vida
 * (0..1). Debe coincidir con `arcHeight` de `MonitorView`: si no, el jugador
 * apuntaría a un sitio y el corte se calcularía en otro.
 */
function arcY(progress: number): number {
  return 0.85 - 0.6 * Math.sin(progress * Math.PI);
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
          lastHitAt: null,
          lastMissAt: null,
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

  /** Posición vertical actual del objeto (misma fórmula que el monitor). */
  function currentY(o: FallingObject): number {
    return arcY(Math.min(1, (elapsed - o.spawnedAt) / OBJECT_LIFETIME_MS));
  }

  /**
   * Objeto vivo más cercano al punto (px, py) del carril, siempre que esté
   * dentro de `SLICE_RADIUS`. Si hay una bomba y una fruta juntas, gana la que
   * esté realmente bajo el cursor, no la que apareció antes.
   */
  function nearestSliceable(
    lane: FruitLane,
    px: number,
    py: number
  ): FallingObject | undefined {
    let best: FallingObject | undefined;
    let bestDist = SLICE_RADIUS;
    for (const o of lane.objects) {
      if (o.sliced) continue;
      if (elapsed - o.spawnedAt >= OBJECT_LIFETIME_MS) continue;
      const dx = o.x - px;
      const dy = (currentY(o) - py) * STAGE_ASPECT_CORRECTION;
      const dist = Math.hypot(dx, dy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    return best;
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

      if (input.type === "aim") {
        cursor.x = clamp01(input.x);
        cursor.y = clamp01(input.y);
        emit();
        return;
      }

      // input.type === "slice": corte posicional en el punto indicado.
      const px = clamp01(input.x);
      const py = clamp01(input.y);
      cursor.x = px;
      cursor.y = py;

      const found = laneForPlayer(playerId);
      if (!found) return;

      const target = nearestSliceable(found.lane, px, py);
      if (!target) {
        // Corte al aire: sin penalización, solo un anillo tenue en el monitor.
        cursor.lastMissAt = elapsed;
        emit();
        return;
      }

      target.sliced = true;
      target.slicedAt = elapsed;
      target.slicedBy = playerId;
      cursor.lastHitAt = elapsed;

      const amount = target.kind === "bomb" ? -BOMB_PENALTY : FRUIT_POINTS;
      state.scores[playerId] = (state.scores[playerId] ?? 0) + amount;
      if (target.kind === "bomb") {
        found.lane.lastBombAt = elapsed;
      }
      state.popups.push({
        id: nextPopupId++,
        laneIndex: found.index,
        x: px,
        y: py,
        amount,
        spawnedAt: elapsed,
      });
      emit();
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      elapsed += dtMs;
      state.now = elapsed;
      state.remainingMs = Math.max(0, durationMs - elapsed);

      state.lanes.forEach((lane, i) => {
        if (elapsed >= nextSpawnAt[i]) {
          lane.objects.push({
            id: nextId++,
            kind: Math.random() < BOMB_CHANCE ? "bomb" : randomFruitKind(),
            x: 0.14 + Math.random() * 0.72,
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
