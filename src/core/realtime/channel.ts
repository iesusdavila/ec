/**
 * Convenciones de nombres de canal y eventos.
 *
 * Toda una sesión de juego vive en un único canal de tipo "presence" de
 * Pusher, nombrado a partir del PIN. Pusher mantiene automáticamente la
 * lista de miembros conectados (esto reemplaza la necesidad de una base de
 * datos para saber qué jugadores están conectados).
 */

export function sessionChannelName(pin: string): string {
  return `presence-session-${pin}`;
}

export function pinFromChannelName(channelName: string): string | null {
  const match = channelName.match(/^presence-session-(\d{4,6})$/);
  return match ? match[1] : null;
}

/** Nombres de eventos "client-*" enviados directamente entre navegadores. */
export const RealtimeEvent = {
  /** Host -> todos. Snapshot de estado de sesión (status, juego seleccionado). */
  SessionState: "client-session-state",
  /** Host -> todos. Snapshot de estado del juego en curso. */
  GameState: "client-game-state",
  /** Jugador -> host. Entrada de control (gesto, inclinación, botón). */
  PlayerInput: "client-player-input",
  /** Jugador -> host. Aviso de que ya terminó su calibración/permiso y puede jugar. */
  PlayerReady: "client-player-ready",
  /** Host -> todos. Señal de que el host se está cerrando (fin de sesión). */
  SessionClosed: "client-session-closed",
} as const;
