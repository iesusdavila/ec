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

export const FRUIT_KINDS = ["apple", "watermelon", "orange", "banana"] as const;
export type FruitKind = (typeof FRUIT_KINDS)[number];
export type ObjectKind = FruitKind | "bomb";

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
  popups: ScorePopup[];
  scores: Record<string, number>;
}

function randomFruitKind(): FruitKind {
  return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
}

export function createFruitSliceEngine(
  context: GameEngineContext
): GameEngine<Record<string, never>> {
  const durationMs = context.options.roundValue * 1000 || BASE_ROUND_MS;
  const splitScreen = context.options.splitScreen && context.players.length > 1;

  let elapsed = 0;
  let nextId = 1;
  let nextPopupId = 1;

  const lanes: FruitLane[] = splitScreen
    ? context.players.map((p) => ({ playerIds: [p.id], objects: [], lastBombAt: null }))
    : [{ playerIds: context.players.map((p) => p.id), objects: [], lastBombAt: null }];

  const nextSpawnAt = lanes.map(() => 0);

  const state: FruitSliceState = {
    phase: "playing",
    now: 0,
    durationMs,
    remainingMs: durationMs,
    splitScreen: Boolean(splitScreen),
    lanes,
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

  function activeSliceable(lane: FruitLane): FallingObject | undefined {
    return lane.objects.find((o) => !o.sliced && elapsed - o.spawnedAt < OBJECT_LIFETIME_MS);
  }

  return {
    getState: () => state,

    start: () => {
      state.lanes.forEach((_, i) => scheduleSpawn(i));
      emit();
    },

    handleInput: (playerId) => {
      if (state.phase !== "playing") return;
      const found = laneForPlayer(playerId);
      if (!found) return;
      const target = activeSliceable(found.lane);
      if (!target) return;

      target.sliced = true;
      target.slicedAt = elapsed;
      target.slicedBy = playerId;

      const amount = target.kind === "bomb" ? -BOMB_PENALTY : FRUIT_POINTS;
      state.scores[playerId] = (state.scores[playerId] ?? 0) + amount;
      if (target.kind === "bomb") {
        found.lane.lastBombAt = elapsed;
      }
      state.popups.push({
        id: nextPopupId++,
        laneIndex: found.index,
        x: target.x,
        y: 0.5,
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
