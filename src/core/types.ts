/**
 * Tipos centrales compartidos por toda la plataforma.
 * Independientes de cualquier juego concreto.
 */

export type Role = "host" | "player";

export type SensorType =
  | "accelerometer"
  | "gyroscope"
  | "orientation"
  | "motion";

/** Estados posibles de una sesión (ver README, sección 14). */
export type SessionStatus =
  | "CREATED"
  | "WAITING_FOR_PLAYERS"
  | "READY"
  | "SELECTING_GAME"
  | "STARTING"
  | "PLAYING"
  | "PAUSED"
  | "FINISHED"
  | "CLOSED";

export interface Player {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
}

export interface SessionInfo {
  pin: string;
  status: SessionStatus;
  selectedGameId: string | null;
  players: Player[];
}

/** Resultado genérico devuelto por cualquier juego al finalizar. */
export interface GameResult {
  /** ids de jugadores ordenados de mejor a peor puesto */
  ranking: string[];
  scores: Record<string, number>;
  winnerId: string | null;
}

export const PLAYER_COLORS = [
  "#5B8CFF", // acento principal
  "#FF6B5B",
  "#3ECF8E",
  "#FFC24B",
  "#B77BFF",
] as const;
