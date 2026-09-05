import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";

export interface Cube3dInput {
  gammaDeg: number;
  betaDeg: number;
}

export const PLATFORM_HALF = 5;
export const CUBE_HALF = 0.4;
export const OBSTACLE = { x: 0, z: 0, halfW: 1, halfD: 1 };
export const GOAL = { x: 3.6, z: 0, r: 0.7 };
export const START = { x: -3.6, z: 0 };

const MATCH_DURATION_MS = 30000;
const MAX_ACCEL = 14;
const MAX_TILT_DEG = 30;
const DAMPING_PER_S = 0.55;

interface CubePlayerState {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  tiltX: number;
  tiltZ: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface Cube3dState {
  phase: "playing" | "gameover";
  elapsedMs: number;
  remainingMs: number;
  players: CubePlayerState[];
}

function collideObstacle(x: number, z: number, vx: number, vz: number) {
  const closestX = Math.max(OBSTACLE.x - OBSTACLE.halfW, Math.min(x, OBSTACLE.x + OBSTACLE.halfW));
  const closestZ = Math.max(OBSTACLE.z - OBSTACLE.halfD, Math.min(z, OBSTACLE.z + OBSTACLE.halfD));
  const dx = x - closestX;
  const dz = z - closestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= CUBE_HALF * CUBE_HALF) return { x, z, vx, vz };

  const dist = Math.sqrt(distSq) || 0.0001;
  const pushX = (dx / dist) * (CUBE_HALF - dist);
  const pushZ = (dz / dist) * (CUBE_HALF - dist);
  return {
    x: x + pushX,
    z: z + pushZ,
    vx: Math.abs(pushX) > Math.abs(pushZ) ? 0 : vx,
    vz: Math.abs(pushZ) >= Math.abs(pushX) ? 0 : vz,
  };
}

export function createCube3dEngine(context: GameEngineContext): GameEngine<Cube3dInput> {
  const state: Cube3dState = {
    phase: "playing",
    elapsedMs: 0,
    remainingMs: MATCH_DURATION_MS,
    players: context.players.map((p) => ({
      id: p.id,
      x: START.x,
      z: START.z,
      vx: 0,
      vz: 0,
      tiltX: 0,
      tiltZ: 0,
      finished: false,
      finishTimeMs: null,
    })),
  };

  function emit() {
    context.onStateChange(state);
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.finished) return;
      player.tiltX = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, input.gammaDeg)) / MAX_TILT_DEG;
      player.tiltZ = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, input.betaDeg)) / MAX_TILT_DEG;
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      const dt = dtMs / 1000;
      state.elapsedMs += dtMs;
      state.remainingMs = Math.max(0, MATCH_DURATION_MS - state.elapsedMs);

      for (const player of state.players) {
        if (player.finished) continue;

        player.vx += player.tiltX * MAX_ACCEL * dt;
        player.vz += player.tiltZ * MAX_ACCEL * dt;
        const damping = Math.pow(DAMPING_PER_S, dt);
        player.vx *= damping;
        player.vz *= damping;

        let x = player.x + player.vx * dt;
        let z = player.z + player.vz * dt;

        const resolved = collideObstacle(x, z, player.vx, player.vz);
        x = resolved.x;
        z = resolved.z;
        player.vx = resolved.vx;
        player.vz = resolved.vz;

        if (Math.abs(x) > PLATFORM_HALF || Math.abs(z) > PLATFORM_HALF) {
          x = START.x;
          z = START.z;
          player.vx = 0;
          player.vz = 0;
        }

        player.x = x;
        player.z = z;

        if (Math.hypot(x - GOAL.x, z - GOAL.z) < GOAL.r) {
          player.finished = true;
          player.finishTimeMs = state.elapsedMs;
        }
      }

      if (state.players.every((p) => p.finished) || state.remainingMs <= 0) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = [...state.players].sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished && b.finished) return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
        return Math.hypot(a.x - GOAL.x, a.z - GOAL.z) - Math.hypot(b.x - GOAL.x, b.z - GOAL.z);
      });
      return {
        ranking: ranking.map((p) => p.id),
        scores: Object.fromEntries(state.players.map((p) => [p.id, p.finished ? 1 : 0])),
        winnerId: ranking[0]?.finished ? ranking[0].id : null,
      };
    },

    cleanup: () => {},
  };
}
