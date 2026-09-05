import type { ComponentType } from "react";
import type { GameResult, Player, SensorType } from "@/core/types";

export interface GameMonitorProps<TState> {
  state: TState | null;
  players: Player[];
}

export interface GamePlayerProps<TInput> {
  myId: string;
  players: Player[];
  /** Estado público del juego, recibido en tiempo real desde el host. */
  gameState: unknown;
  sendInput: (input: TInput) => void;
}

export interface GameEngine<TInput = unknown> {
  getState: () => unknown;
  start: () => void;
  handleInput: (playerId: string, input: TInput) => void;
  /** Paso de simulación; los juegos por turnos pueden dejarlo vacío. */
  tick: (dtMs: number) => void;
  isFinished: () => boolean;
  getResult: () => GameResult;
  /** Libera timers internos del motor. No confundir con limpieza de sensores. */
  cleanup: () => void;
}

export interface GameEngineContext {
  players: Player[];
  /** El motor debe llamar esto cada vez que su estado cambie. */
  onStateChange: (state: unknown) => void;
}

export interface GameDefinition<TInput = unknown> {
  id: string;
  name: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  requiredSensors: SensorType[];
  /** Si el juego usa inclinación, conviene calibrar antes de empezar. */
  needsCalibration: boolean;
  Thumbnail: ComponentType<{ className?: string }>;
  MonitorComponent: ComponentType<GameMonitorProps<unknown>>;
  PlayerComponent: ComponentType<GamePlayerProps<TInput>>;
  createEngine: (context: GameEngineContext) => GameEngine<TInput>;
}
