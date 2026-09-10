/**
 * Protocolo del MANDO: el teléfono como puñado de botones y nada más.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ NO BASTA CON MANDAR "SE PULSÓ X"
 *
 * Pusher admite 10 eventos por segundo y por conexión, y descarta el resto en
 * silencio (§7.5 del HANDOFF). Un jugador aporreando botones en un juego de
 * plataformas se pasa de ahí sin despeinarse, así que los envíos van
 * agrupados por `clientEventBudget`. Y en cuanto se agrupa aparece el problema
 * de verdad: entre un envío y el siguiente puede caber un toque ENTERO —pulsar
 * y soltar saltar en 60 ms—, y con solo mandar "qué botones están pulsados
 * ahora" ese salto desaparecería. En un juego de saltar, perder saltos es
 * perder el juego.
 *
 * Por eso cada mensaje lleva las dos cosas:
 *
 *   - `h`: qué está pulsado AHORA. Es un estado absoluto, así que si un
 *     mensaje se pierde, el siguiente lo corrige solo. Sirve para lo continuo
 *     (moverse a la izquierda mientras se mantiene el botón).
 *   - `p`: qué se pulsó DESDE EL ÚLTIMO ENVÍO, aunque ya se haya soltado. Es
 *     acumulativo, así que ningún toque se pierde por muy corto que sea.
 *     Sirve para lo instantáneo (saltar, poner una bomba).
 *
 * El motor consume `p` como flanco y `h` como estado. Nunca hay que deducir
 * el flanco comparando estados, que es justo lo que fallaría al perderse un
 * mensaje.
 * ---------------------------------------------------------------------------
 */

export interface PadInput {
  /** Botones mantenidos en el instante del envío. */
  h: string[];
  /** Botones pulsados desde el envío anterior (aunque ya se soltaran). */
  p: string[];
}

/** Estado del mando de un jugador, tal como lo mantiene el motor. */
export interface PadState {
  /** Botones mantenidos según el último mensaje recibido. */
  held: Set<string>;
  /**
   * Flancos pendientes de consumir. El motor los saca con `takePress()`
   * dentro de su `tick`, no en `handleInput`: así un toque siempre se procesa
   * dentro de un paso de simulación y con el resto del estado coherente.
   */
  pending: string[];
}

export function createPadState(): PadState {
  return { held: new Set(), pending: [] };
}

/** Aplica un mensaje del teléfono al estado del mando. */
export function applyPadInput(pad: PadState, input: PadInput): void {
  // Defensivo: esto viene de la red como JSON y no hay nada que garantice su
  // forma. Un mando con basura dentro rompería el bucle del motor entero.
  if (Array.isArray(input?.h)) {
    pad.held = new Set(input.h.filter((b) => typeof b === "string"));
  }
  if (Array.isArray(input?.p)) {
    for (const button of input.p) {
      if (typeof button === "string") pad.pending.push(button);
    }
  }
}

/** ¿Se pulsó este botón desde el último `tick`? Lo consume. */
export function takePress(pad: PadState, button: string): boolean {
  const index = pad.pending.indexOf(button);
  if (index === -1) return false;
  pad.pending.splice(index, 1);
  return true;
}

/** Descarta los flancos que ningún motor llegó a consumir en este `tick`. */
export function clearPresses(pad: PadState): void {
  pad.pending.length = 0;
}

export function isHeld(pad: PadState, button: string): boolean {
  return pad.held.has(button);
}

/**
 * Eje horizontal a partir de dos botones: −1, 0 o +1.
 * Pulsar los dos a la vez se anula, que es lo que espera cualquiera.
 */
export function axis(pad: PadState, negative: string, positive: string): number {
  return (isHeld(pad, positive) ? 1 : 0) - (isHeld(pad, negative) ? 1 : 0);
}
