import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

const DEFAULT_THROWS_PER_PLAYER = 3;
/** Pequeño temblor para que no sea perfectamente milimétrico, no reemplaza la puntería real. */
const HAND_JITTER = 0.03;

export type DartsInput = { type: "aim"; x: number; y: number } | { type: "throw" };

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
  throwsPerPlayer: number;
  throwsTaken: Record<string, number>;
  scores: Record<string, number>;
  aimX: number;
  aimY: number;
  lastThrow: DartThrow | null;
}

function pointsForDistance(distance: number): number {
  if (distance < 0.08) return 50;
  if (distance < 0.2) return 25;
  if (distance < 0.4) return 15;
  if (distance < 0.65) return 10;
  if (distance < 0.9) return 5;
  return 0;
}

export function createDartsEngine(context: GameEngineContext): GameEngine<DartsInput> {
  const throwsPerPlayer = context.options.roundValue || DEFAULT_THROWS_PER_PLAYER;
  const turnOrder = context.players.map((p) => p.id);

  const state: DartsState = {
    phase: "aiming",
    turnOrder,
    currentPlayerId: turnOrder[0] ?? null,
    throwsPerPlayer,
    throwsTaken: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    scores: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    aimX: 0,
    aimY: 0,
    lastThrow: null,
  };

  function emit() {
    context.onStateChange(state);
  }

  function advanceTurn() {
    if (turnOrder.every((id) => state.throwsTaken[id] >= throwsPerPlayer)) {
      state.phase = "gameover";
      state.currentPlayerId = null;
      return;
    }
    const currentIndex = turnOrder.indexOf(state.currentPlayerId ?? turnOrder[0]);
    for (let step = 1; step <= turnOrder.length; step++) {
      const candidate = turnOrder[(currentIndex + step) % turnOrder.length];
      if (state.throwsTaken[candidate] < throwsPerPlayer) {
        state.currentPlayerId = candidate;
        state.aimX = 0;
        state.aimY = 0;
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
        state.aimY = Math.max(-1, Math.min(1, input.y));
        emit();
        return;
      }

      if (input.type === "throw") {
        const jitterX = (Math.random() - 0.5) * HAND_JITTER;
        const jitterY = (Math.random() - 0.5) * HAND_JITTER;
        const x = Math.max(-1, Math.min(1, state.aimX + jitterX));
        const y = Math.max(-1, Math.min(1, state.aimY + jitterY));
        const points = pointsForDistance(Math.hypot(x, y));

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
