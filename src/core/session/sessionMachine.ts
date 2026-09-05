import type { SessionStatus } from "@/core/types";

/**
 * Transiciones válidas de estado de sesión (ver README sección 14).
 * Cualquier transición no listada aquí se considera inválida y se ignora,
 * evitando estados inconsistentes (por ejemplo, iniciar un juego sin
 * suficientes jugadores, o saltar directamente de CREATED a PLAYING).
 */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  CREATED: ["WAITING_FOR_PLAYERS", "CLOSED"],
  WAITING_FOR_PLAYERS: ["SELECTING_GAME", "CLOSED"],
  SELECTING_GAME: ["SELECTING_GAME", "READY", "WAITING_FOR_PLAYERS", "CLOSED"],
  READY: ["SELECTING_GAME", "STARTING", "CLOSED"],
  STARTING: ["PLAYING", "SELECTING_GAME", "CLOSED"],
  PLAYING: ["PAUSED", "FINISHED", "SELECTING_GAME", "CLOSED"],
  PAUSED: ["PLAYING", "FINISHED", "SELECTING_GAME", "CLOSED"],
  FINISHED: ["SELECTING_GAME", "CLOSED"],
  CLOSED: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PlayerCountRule {
  minPlayers: number;
  maxPlayers: number;
}

export function canStartGame(rule: PlayerCountRule, connectedPlayers: number): boolean {
  return connectedPlayers >= rule.minPlayers && connectedPlayers <= rule.maxPlayers;
}

export function canPlayerJoin(rule: PlayerCountRule, connectedPlayers: number): boolean {
  return connectedPlayers < rule.maxPlayers;
}
