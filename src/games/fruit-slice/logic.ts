import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const ROUND_MS = 30000;
const SPAWN_MIN_MS = 550;
const SPAWN_MAX_MS = 1000;
const OBJECT_LIFETIME_MS = 2000;
/** Cuánto se deja el objeto en pantalla tras ser cortado, para la animación. */
const SLICE_LINGER_MS = 450;
const BOMB_CHANCE = 0.2;

export const FRUIT_KINDS = ["apple", "watermelon", "orange", "banana"] as const;
export type FruitKind = (typeof FRUIT_KINDS)[number];
export type ObjectKind = FruitKind | "bomb";

export interface FallingObject {
  id: number;
  kind: ObjectKind;
  x: number; // 0..1, posición horizontal
  spawnedAt: number;
  sliced: boolean;
  slicedAt: number | null;
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

function randomFruitKind(): FruitKind {
  return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
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
      target.slicedAt = elapsed;
      target.slicedBy = playerId;
      state.scores[playerId] = (state.scores[playerId] ?? 0) + (target.kind === "bomb" ? -1 : 1);
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
          kind: Math.random() < BOMB_CHANCE ? "bomb" : randomFruitKind(),
          x: 0.12 + Math.random() * 0.76,
          spawnedAt: elapsed,
          sliced: false,
          slicedAt: null,
          slicedBy: null,
        });
        scheduleNextSpawn();
      }

      state.objects = state.objects.filter((o) =>
        o.sliced
          ? elapsed - (o.slicedAt ?? elapsed) < SLICE_LINGER_MS
          : elapsed - o.spawnedAt < OBJECT_LIFETIME_MS
      );

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
