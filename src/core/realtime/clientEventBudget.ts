/**
 * Presupuesto de eventos "client-*" de ESTA conexión de Pusher.
 *
 * ---------------------------------------------------------------------------
 * Pusher limita los eventos de cliente a 10 por segundo y por CONEXIÓN, y al
 * pasarse descarta los sobrantes en silencio: `channel.trigger()` sigue
 * devolviendo `true` y no hay error en consola (§7.5 del HANDOFF).
 *
 * Hasta ahora cada emisor se autolimitaba a ojo con su propio `throttle`, sin
 * saber qué estaban gastando los demás. El host se pasaba de largo: 70 ms de
 * broadcast (~14/s) + heartbeat cada 600 ms + estado de sesión ≈ 16/s, con lo
 * que Pusher tiraba uno de cada tres mensajes al azar. Y "al azar" incluye los
 * mensajes que sí importan.
 *
 * Este módulo centraliza la cuenta en una ventana deslizante de un segundo:
 *
 *  - Los eventos DISCRETOS (estado de sesión, jugador listo, cierre) se envían
 *    siempre. Son raros y perderlos rompe la partida.
 *  - Los FLUJOS CONTINUOS (posición del puntero, snapshots de estado) preguntan
 *    antes con `canStream()`, que además de la cuota respeta un espaciado
 *    mínimo. Así nunca se comen la reserva de los discretos y no se envían a
 *    ráfagas — una ráfaga de 9 mensajes en 200 ms cabe en la cuota pero se ve
 *    igual de mal que no enviarlos.
 * ---------------------------------------------------------------------------
 */

/** Límite duro de Pusher. No es configurable: es lo que hace su servidor. */
const HARD_LIMIT_PER_SECOND = 10;
/** Techo de los flujos continuos; deja 1/s de reserva para eventos discretos. */
const STREAM_LIMIT_PER_SECOND = HARD_LIMIT_PER_SECOND - 1;
/** Espaciado mínimo entre envíos de un flujo continuo (~9/s bien repartidos). */
const MIN_STREAM_SPACING_MS = 100;

class ClientEventBudget {
  /** Marcas de tiempo de los envíos del último segundo, en orden. */
  private sentAt: number[] = [];
  private lastStreamAt = 0;

  private prune(now: number): void {
    while (this.sentAt.length > 0 && now - this.sentAt[0] >= 1000) {
      this.sentAt.shift();
    }
  }

  /** Eventos enviados en el último segundo. Útil para diagnóstico. */
  used(now = Date.now()): number {
    this.prune(now);
    return this.sentAt.length;
  }

  /** Lo llama `sendClientEvent` con cada envío, sea del tipo que sea. */
  record(now = Date.now()): void {
    this.prune(now);
    this.sentAt.push(now);
  }

  /** ¿Tiene sitio ahora mismo un flujo continuo? */
  canStream(now = Date.now()): boolean {
    this.prune(now);
    return (
      this.sentAt.length < STREAM_LIMIT_PER_SECOND &&
      now - this.lastStreamAt >= MIN_STREAM_SPACING_MS
    );
  }

  /** ms que faltan para que un flujo continuo vuelva a tener sitio. */
  msUntilStream(now = Date.now()): number {
    this.prune(now);
    const bySpacing = MIN_STREAM_SPACING_MS - (now - this.lastStreamAt);
    const byQuota =
      this.sentAt.length < STREAM_LIMIT_PER_SECOND
        ? 0
        : 1000 - (now - this.sentAt[this.sentAt.length - STREAM_LIMIT_PER_SECOND]);
    return Math.max(0, bySpacing, byQuota);
  }

  /** Marca el envío de un flujo continuo (cuenta cuota y espaciado). */
  noteStream(now = Date.now()): void {
    this.lastStreamAt = now;
  }
}

/** Una conexión de Pusher por pestaña, así que un presupuesto por pestaña. */
export const clientEventBudget = new ClientEventBudget();
