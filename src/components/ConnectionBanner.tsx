import type { ConnectionState } from "@/core/realtime/usePresenceChannel";

/**
 * Aviso discreto de problemas de conexión en tiempo real. No interrumpe la
 * pantalla (sección 26: no mostrar errores técnicos ni bloquear con
 * mensajes agresivos), solo informa mientras Pusher intenta recuperarse.
 */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state !== "unavailable" && state !== "failed") return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-500/90 text-white text-sm text-center py-2">
      Conexión inestable. Intentando reconectar…
    </div>
  );
}
