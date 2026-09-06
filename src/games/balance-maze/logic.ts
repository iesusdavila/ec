import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";
import { LEVELS, WORLD_HEIGHT, WORLD_WIDTH, type Rect } from "@/games/balance-maze/levels";
import { nextLevelIndex } from "@/games/balance-maze/levelRotation";

export interface BalanceInput {
  gammaDeg: number;
  betaDeg: number;
}

const BASE_DURATION_MS = 45000;
const BALL_RADIUS = 14;
const MAX_ACCEL = 2200; // unidades de mundo por s^2 con inclinación máxima
const MAX_TILT_DEG = 30;
const DAMPING_PER_S = 0.6; // fracción de velocidad retenida cada segundo

interface BalancePlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tiltX: number;
  tiltY: number;
  /** Ya llegó a la meta del nivel actual y espera a que los demás lleguen. */
  reachedGoal: boolean;
  levelsCompleted: number;
}

export interface BalanceState {
  phase: "playing" | "gameover";
  levelName: string;
  levelsCompleted: number;
  walls: Rect[];
  hazards: Rect[];
  goal: { x: number; y: number; r: number };
  elapsedMs: number;
  remainingMs: number;
  players: BalancePlayerState[];
}

function resolveWallCollisions(
  x: number,
  y: number,
  vx: number,
  vy: number,
  walls: Rect[]
): { x: number; y: number; vx: number; vy: number } {
  let nx = x;
  let ny = y;
  let nvx = vx;
  let nvy = vy;

  for (const wall of walls) {
    const closestX = Math.max(wall.x, Math.min(nx, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(ny, wall.y + wall.h));
    const dx = nx - closestX;
    const dy = ny - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < BALL_RADIUS * BALL_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const pushX = (dx / dist) * (BALL_RADIUS - dist);
      const pushY = (dy / dist) * (BALL_RADIUS - dist);
      nx += pushX;
      ny += pushY;
      if (Math.abs(pushX) > Math.abs(pushY)) {
        nvx = 0;
      } else {
        nvy = 0;
      }
    }
  }

  return { x: nx, y: ny, vx: nvx, vy: nvy };
}

function overlapsRect(x: number, y: number, rect: Rect): boolean {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < BALL_RADIUS * BALL_RADIUS;
}

export function createBalanceMazeEngine(context: GameEngineContext): GameEngine<BalanceInput> {
  const durationMs = context.options.roundValue * 1000 || BASE_DURATION_MS;
  let levelCursor = nextLevelIndex();
  let level = LEVELS[levelCursor % LEVELS.length];

  const state: BalanceState = {
    phase: "playing",
    levelName: level.name,
    levelsCompleted: 0,
    walls: level.walls,
    hazards: level.hazards,
    goal: level.goal,
    elapsedMs: 0,
    remainingMs: durationMs,
    players: context.players.map((p) => ({
      id: p.id,
      x: level.start.x,
      y: level.start.y,
      vx: 0,
      vy: 0,
      tiltX: 0,
      tiltY: 0,
      reachedGoal: false,
      levelsCompleted: 0,
    })),
  };

  function emit() {
    context.onStateChange(state);
  }

  function advanceLevel() {
    levelCursor += 1;
    level = LEVELS[levelCursor % LEVELS.length];
    state.levelName = level.name;
    state.walls = level.walls;
    state.hazards = level.hazards;
    state.goal = level.goal;
    for (const player of state.players) {
      player.levelsCompleted += 1;
      player.x = level.start.x;
      player.y = level.start.y;
      player.vx = 0;
      player.vy = 0;
      player.reachedGoal = false;
    }
    state.levelsCompleted += 1;
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.reachedGoal) return;
      player.tiltX = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, input.gammaDeg)) / MAX_TILT_DEG;
      player.tiltY = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, input.betaDeg)) / MAX_TILT_DEG;
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      const dt = dtMs / 1000;
      state.elapsedMs += dtMs;
      state.remainingMs = Math.max(0, durationMs - state.elapsedMs);

      for (const player of state.players) {
        if (player.reachedGoal) continue;

        player.vx += player.tiltX * MAX_ACCEL * dt;
        player.vy += player.tiltY * MAX_ACCEL * dt;

        const damping = Math.pow(DAMPING_PER_S, dt);
        player.vx *= damping;
        player.vy *= damping;

        let x = player.x + player.vx * dt;
        let y = player.y + player.vy * dt;
        x = Math.max(BALL_RADIUS, Math.min(WORLD_WIDTH - BALL_RADIUS, x));
        y = Math.max(BALL_RADIUS, Math.min(WORLD_HEIGHT - BALL_RADIUS, y));

        const resolved = resolveWallCollisions(x, y, player.vx, player.vy, state.walls);
        player.x = resolved.x;
        player.y = resolved.y;
        player.vx = resolved.vx;
        player.vy = resolved.vy;

        for (const hazard of state.hazards) {
          if (overlapsRect(player.x, player.y, hazard)) {
            player.x = level.start.x;
            player.y = level.start.y;
            player.vx = 0;
            player.vy = 0;
            break;
          }
        }

        const dxGoal = player.x - state.goal.x;
        const dyGoal = player.y - state.goal.y;
        if (Math.sqrt(dxGoal * dxGoal + dyGoal * dyGoal) < state.goal.r) {
          player.reachedGoal = true;
        }
      }

      if (state.players.every((p) => p.reachedGoal)) {
        advanceLevel();
      }

      if (state.remainingMs <= 0) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = [...state.players].sort((a, b) => {
        if (b.levelsCompleted !== a.levelsCompleted) return b.levelsCompleted - a.levelsCompleted;
        if (a.reachedGoal !== b.reachedGoal) return a.reachedGoal ? -1 : 1;
        const distA = Math.hypot(a.x - state.goal.x, a.y - state.goal.y);
        const distB = Math.hypot(b.x - state.goal.x, b.y - state.goal.y);
        return distA - distB;
      });
      const scores = Object.fromEntries(state.players.map((p) => [p.id, p.levelsCompleted]));
      return {
        ranking: ranking.map((p) => p.id),
        scores,
        winnerId: ranking[0]?.id ?? null,
      };
    },

    cleanup: () => {},
  };
}
