import type { GameDefinition } from "@/games/types";

/**
 * Registro central de juegos disponibles.
 *
 * Agregar un juego nuevo consiste en crear su carpeta bajo `src/games/<id>`
 * con su propio `definition.tsx`, e importarlo aquí. Ningún otro archivo del
 * core necesita cambiar (ver README sección 13).
 */
const registry = new Map<string, GameDefinition>();

/**
 * Acepta un GameDefinition con cualquier tipo de entrada concreto (p. ej.
 * GameDefinition<Direction>) y lo almacena con el tipo erasado, ya que el
 * registro es intencionalmente heterogéneo: cada juego decide su propio
 * tipo de entrada, y en el límite de red (JSON sobre Pusher) esa
 * información de tipo ya se pierde de todas formas.
 */
export function registerGame<TInput>(definition: GameDefinition<TInput>): void {
  registry.set(definition.id, definition as unknown as GameDefinition);
}

export function getGame(id: string): GameDefinition | undefined {
  return registry.get(id);
}

export function listGames(): GameDefinition[] {
  return Array.from(registry.values());
}
