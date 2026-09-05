import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const THROWS_PER_PLAYER = 3;

export type DartsInput =
  | { type: "aim"; x: number }
  | { type: "throw"; intensity: number };

export interface DartThrow {
  playerId: string;
  x: number;
  y: number;
  points: number;
}

export interface DartsState {
  phase: "aiming" | "gameover";
  turnOrder: string[];
  currentPlayerId: string | null;
  throwsTaken: Record<string, number>;
  scores: Record<string, number>;
  aimX: number;
  lastThrow: DartThrow | null;
}

function pointsForOffset(absX: number): number {
  if (absX < 0.06) return 50;
  if (absX < 0.16) return 25;
  if (absX < 0.35) return 15;
  if (absX < 0.6) return 10;
  if (absX < 0.85) return 5;
  return 0;
}

export function createDartsEngine(context: GameEngineContext): GameEngine<DartsInput> {
  const turnOrder = context.players.map((p) => p.id);

  const state: DartsState = {
    phase: "aiming",
    turnOrder,
    currentPlayerId: turnOrder[0] ?? null,
    throwsTaken: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    scores: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    aimX: 0,
    lastThrow: null,
  };

  function emit() {
    context.onStateChange(state);
  }

  function advanceTurn() {
    if (turnOrder.every((id) => state.throwsTaken[id] >= THROWS_PER_PLAYER)) {
      state.phase = "gameover";
      state.currentPlayerId = null;
      return;
    }
    const currentIndex = turnOrder.indexOf(state.currentPlayerId ?? turnOrder[0]);
    for (let step = 1; step <= turnOrder.length; step++) {
      const candidate = turnOrder[(currentIndex + step) % turnOrder.length];
      if (state.throwsTaken[candidate] < THROWS_PER_PLAYER) {
        state.currentPlayerId = candidate;
        state.aimX = 0;
        return;
      }
    }
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      if (state.phase !== "aiming" || playerId !== state.currentPlayerId) return;

      if (input.type === "aim") {
        state.aimX = Math.max(-1, Math.min(1, input.x));
        emit();
        return;
      }

      if (input.type === "throw") {
        const jitter = (Math.random() - 0.5) * 0.08;
        const x = Math.max(-1, Math.min(1, state.aimX + jitter));
        const y = (Math.random() - 0.5) * 0.3;
        const points = pointsForOffset(Math.abs(x));

        state.throwsTaken[playerId] += 1;
        state.scores[playerId] += points;
        state.lastThrow = { playerId, x, y, points };
        advanceTurn();
        emit();
      }
    },

    tick: () => {},

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = [...turnOrder].sort((a, b) => state.scores[b] - state.scores[a]);
      return {
        ranking,
        scores: state.scores,
        winnerId: ranking[0] ?? null,
      };
    },

    cleanup: () => {},
  };
}
