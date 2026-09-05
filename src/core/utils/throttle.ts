/**
 * Limita la frecuencia de envío de eventos en tiempo real (por ejemplo,
 * snapshots de estado de juego). Es importante mantener esto bajo control:
 * los eventos "client-*" de Pusher cuentan contra la cuota del plan
 * gratuito, y un juego con física continua podría fácilmente enviar cientos
 * de mensajes por segundo si no se limita.
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
