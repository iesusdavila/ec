/**
 * Limitador de frecuencia genérico, con envío de cola.
 *
 * OJO: **no lo uses para respetar el límite de Pusher.** Para eso está
 * `core/realtime/clientEventBudget.ts`. Un `throttle` por emisor no sabe lo que
 * están gastando los demás, y así fue como el host acabó emitiendo 16 mensajes
 * por segundo contra un límite de 10, con Pusher descartando el resto en
 * silencio (§7.5 del HANDOFF). Hoy nadie lo usa; queda por si hace falta
 * limitar algo que no viaje por el canal.
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  intervalMs: number
): (...args: Args) => void {
  let lastCall = 0;
  let pendingArgs: Args | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const invoke = (args: Args) => {
    lastCall = Date.now();
    pendingArgs = null;
    fn(...args);
  };

  return (...args: Args) => {
    const now = Date.now();
    const remaining = intervalMs - (now - lastCall);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      invoke(args);
    } else {
      pendingArgs = args;
      if (!timeout) {
        timeout = setTimeout(() => {
          timeout = null;
          if (pendingArgs) invoke(pendingArgs);
        }, remaining);
      }
    }
  };
}
