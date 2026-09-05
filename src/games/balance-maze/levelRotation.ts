import { LEVELS } from "@/games/balance-maze/levels";

/**
 * Elige un nivel distinto cada vez que se lanza el juego dentro de la misma
 * sesión de monitor, para que rejugar se sienta progresivo sin acoplar la
 * dificultad al estado global de la sesión.
 */
let cursor = 0;

export function nextLevelIndex(): number {
  const index = cursor % LEVELS.length;
  cursor += 1;
  return index;
}
