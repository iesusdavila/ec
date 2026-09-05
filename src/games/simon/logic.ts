import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

export type Direction = "up" | "down" | "left" | "right";

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const SHOW_STEP_MS = 600;
const SHOW_GAP_MS = 250;
const INPUT_MS_PER_STEP = 1600;
const INPUT_MS_BASE = 800;
const MAX_ROUND = 15;

interface SimonPlayerState {
  id: string;
  alive: boolean;
  progress: number;
  completedRound: boolean;
  roundsSurvived: number;
  eliminatedAtRound: number | null;
}

export interface SimonState {
  phase: "showing" | "input" | "gameover";
  sequence: Direction[];
  round: number;
  showIndex: number;
  remainingMs: number;
  players: SimonPlayerState[];
}

function randomDirection(): Direction {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

function inputBudget(steps: number): number {
  return INPUT_MS_BASE + steps * INPUT_MS_PER_STEP;
}

export function createSimonEngine(context: GameEngineContext): GameEngine<Direction> {
  const state: SimonState = {
    phase: "showing",
    sequence: [],
    round: 0,
    showIndex: -1,
    remainingMs: 0,
    players: context.players.map((p) => ({
      id: p.id,
      alive: true,
      progress: 0,
      completedRound: false,
      roundsSurvived: 0,
      eliminatedAtRound: null,
    })),
  };

  function emit() {
    context.onStateChange(state);
  }

  function aliveCount(): number {
    return state.players.filter((p) => p.alive).length;
  }

  function beginRound() {
    state.sequence = [...state.sequence, randomDirection()];
    state.round = state.sequence.length;
    state.showIndex = -1;
    state.phase = "showing";
    state.remainingMs = SHOW_GAP_MS;
    for (const p of state.players) {
      if (p.alive) {
        p.progress = 0;
        p.completedRound = false;
      }
    }
  }

  function endGame() {
    state.phase = "gameover";
  }

  function checkRoundOutcome() {
    const alive = aliveCount();
    const totalPlayers = state.players.length;

    if (alive === 0 || (alive === 1 && totalPlayers > 1)) {
      // Marcar como sobreviviente de esta ronda al único que quede, si aplica.
      for (const p of state.players) {
        if (p.alive) p.roundsSurvived = state.round;
      }
      endGame();
      return;
    }

    const stillPlaying = state.players.filter((p) => p.alive && !p.completedRound);
    if (stillPlaying.length === 0) {
      for (const p of state.players) {
        if (p.alive) p.roundsSurvived = state.round;
      }
      if (state.round >= MAX_ROUND) {
        endGame();
      } else {
        beginRound();
      }
    }
  }

  function eliminate(player: SimonPlayerState) {
    player.alive = false;
    player.eliminatedAtRound = state.round;
  }

  return {
    getState: () => state,

    start: () => {
      beginRound();
      emit();
    },

    handleInput: (playerId, direction) => {
      if (state.phase !== "input") return;
      const player = state.players.find((p) => p.id === playerId);
      if (!player || !player.alive || player.completedRound) return;

      const expected = state.sequence[player.progress];
      if (direction === expected) {
        player.progress += 1;
        if (player.progress >= state.sequence.length) {
          player.completedRound = true;
        }
      } else {
        eliminate(player);
      }
      checkRoundOutcome();
      emit();
    },

    tick: (dtMs) => {
      if (state.phase === "gameover") return;

      if (state.phase === "showing") {
        state.remainingMs -= dtMs;
        if (state.remainingMs <= 0) {
          if (state.showIndex + 1 < state.sequence.length) {
            state.showIndex += 1;
            state.remainingMs = SHOW_STEP_MS;
          } else {
            state.phase = "input";
            state.remainingMs = inputBudget(state.sequence.length);
          }
          emit();
        }
        return;
      }

      if (state.phase === "input") {
        state.remainingMs -= dtMs;
        if (state.remainingMs <= 0) {
          for (const p of state.players) {
            if (p.alive && !p.completedRound) eliminate(p);
          }
          checkRoundOutcome();
        }
        emit();
      }
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const sorted = [...state.players].sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (b.roundsSurvived !== a.roundsSurvived) return b.roundsSurvived - a.roundsSurvived;
        return (b.eliminatedAtRound ?? 0) - (a.eliminatedAtRound ?? 0);
      });
      const winner = sorted.find((p) => p.alive);
      return {
        ranking: sorted.map((p) => p.id),
        scores: Object.fromEntries(state.players.map((p) => [p.id, p.roundsSurvived])),
        winnerId: winner?.id ?? null,
      };
    },

    cleanup: () => {},
  };
}
