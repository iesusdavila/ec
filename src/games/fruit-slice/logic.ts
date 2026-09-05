import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const ROUND_MS = 30000;
const SPAWN_MIN_MS = 500;
const SPAWN_MAX_MS = 950;
const OBJECT_LIFETIME_MS = 1700;
const BOMB_CHANCE = 0.22;

export interface FallingObject {
  id: number;
  kind: "fruit" | "bomb";
  x: number; // 0..1
  spawnedAt: number;
  sliced: boolean;
  slicedBy: string | null;
}

export interface FruitSliceState {
  phase: "playing" | "gameover";
  /** Tiempo transcurrido (ms) desde el inicio de la ronda; usado por el monitor para animar. */
  now: number;
  remainingMs: number;
  objects: FallingObject[];
  scores: Record<string, number>;
}

export function createFruitSliceEngine(context: GameEngineContext): GameEngine<Record<string, never>> {
  let elapsed = 0;
  let nextSpawnAt = 0;
  let nextId = 1;

  const state: FruitSliceState = {
    phase: "playing",
    now: 0,
    remainingMs: ROUND_MS,
    objects: [],
    scores: Object.fromEntries(context.players.map((p) => [p.id, 0])),
  };

  function emit() {
    context.onStateChange(state);
  }

  function scheduleNextSpawn() {
    nextSpawnAt = elapsed + SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS);
  }

  function activeSliceable(): FallingObject | undefined {
    return state.objects.find(
      (o) => !o.sliced && elapsed - o.spawnedAt < OBJECT_LIFETIME_MS
    );
  }

  return {
    getState: () => state,

    start: () => {
      scheduleNextSpawn();
      emit();
    },

    handleInput: (playerId) => {
      if (state.phase !== "playing") return;
      const target = activeSliceable();
      if (!target) return;
      target.sliced = true;
      target.slicedBy = playerId;
      state.scores[playerId] = (state.scores[playerId] ?? 0) + (target.kind === "fruit" ? 1 : -1);
      emit();
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      elapsed += dtMs;
      state.now = elapsed;
      state.remainingMs = Math.max(0, ROUND_MS - elapsed);

      if (elapsed >= nextSpawnAt) {
        state.objects.push({
          id: nextId++,
          kind: Math.random() < BOMB_CHANCE ? "bomb" : "fruit",
          x: 0.1 + Math.random() * 0.8,
          spawnedAt: elapsed,
          sliced: false,
          slicedBy: null,
        });
        scheduleNextSpawn();
      }

      state.objects = state.objects.filter((o) => elapsed - o.spawnedAt < OBJECT_LIFETIME_MS + 300);

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
