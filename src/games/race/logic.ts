import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

export type RaceInput = { type: "advance" } | { type: "lane"; lane: 0 | 1 | 2 };

const TRACK_LENGTH = 1000;
const STEP = 42;
const HIT_COOLDOWN_MS = 700;
const HIT_WINDOW = 16;
const MAX_DURATION_MS = 60000;

interface Obstacle {
  id: number;
  lane: 0 | 1 | 2;
  position: number;
  hitBy: Set<string>;
}

interface RacePlayerState {
  id: string;
  lane: 0 | 1 | 2;
  progress: number;
  cooldownMs: number;
  finished: boolean;
  finishOrder: number | null;
}

export interface RaceState {
  phase: "racing" | "gameover";
  trackLength: number;
  elapsedMs: number;
  obstacles: { id: number; lane: number; position: number }[];
  players: RacePlayerState[];
}

export function createRaceEngine(context: GameEngineContext): GameEngine<RaceInput> {
  const obstacles: Obstacle[] = [];
  let cursor = 140;
  let obstacleId = 0;
  while (cursor < TRACK_LENGTH - 60) {
    if (Math.random() < 0.75) {
      obstacles.push({
        id: obstacleId++,
        lane: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        position: cursor,
        hitBy: new Set(),
      });
    }
    cursor += 90 + Math.random() * 60;
  }

  let finishCounter = 0;

  const state: RaceState = {
    phase: "racing",
    trackLength: TRACK_LENGTH,
    elapsedMs: 0,
    obstacles: obstacles.map(({ id, lane, position }) => ({ id, lane, position })),
    players: context.players.map((p) => ({
      id: p.id,
      lane: 1,
      progress: 0,
      cooldownMs: 0,
      finished: false,
      finishOrder: null,
    })),
  };

  function emit() {
    context.onStateChange(state);
  }

  function checkAllFinished() {
    if (state.players.every((p) => p.finished)) {
      state.phase = "gameover";
    }
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      if (state.phase !== "racing") return;
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.finished) return;

      if (input.type === "lane") {
        player.lane = input.lane;
        emit();
        return;
      }

      if (input.type === "advance") {
        if (player.cooldownMs > 0) return;
        player.progress = Math.min(TRACK_LENGTH, player.progress + STEP);

        for (const obstacle of obstacles) {
          if (obstacle.lane !== player.lane) continue;
          if (obstacle.hitBy.has(player.id)) continue;
          if (Math.abs(obstacle.position - player.progress) <= HIT_WINDOW) {
            obstacle.hitBy.add(player.id);
            player.cooldownMs = HIT_COOLDOWN_MS;
            break;
          }
        }

        if (player.progress >= TRACK_LENGTH) {
          player.finished = true;
          player.finishOrder = finishCounter++;
        }
        checkAllFinished();
        emit();
      }
    },

    tick: (dtMs) => {
      if (state.phase !== "racing") return;
      state.elapsedMs += dtMs;
      for (const player of state.players) {
        if (player.cooldownMs > 0) player.cooldownMs = Math.max(0, player.cooldownMs - dtMs);
      }
      if (state.elapsedMs >= MAX_DURATION_MS) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = [...state.players].sort((a, b) => {
        if (a.finished && b.finished) return (a.finishOrder ?? 0) - (b.finishOrder ?? 0);
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        return b.progress - a.progress;
      });
      return {
        ranking: ranking.map((p) => p.id),
        scores: Object.fromEntries(state.players.map((p) => [p.id, Math.round(p.progress)])),
        winnerId: ranking[0]?.id ?? null,
      };
    },

    cleanup: () => {},
  };
}
