import "server-only";
import PusherServer from "pusher";

/**
 * Cliente de Pusher del lado del servidor.
 *
 * Se usa únicamente para:
 * - Firmar la autenticación de canales presence (obligatorio, requiere el secret).
 * - Verificar si un PIN ya está en uso al crear una sesión.
 *
 * Nunca se expone al navegador.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Configura tus credenciales de Pusher en .env.local (ver .env.example).`
    );
  }
  return value;
}

let instance: PusherServer | null = null;

export function getPusherServer(): PusherServer {
  if (!instance) {
    instance = new PusherServer({
      appId: required("PUSHER_APP_ID"),
      key: required("NEXT_PUBLIC_PUSHER_KEY"),
      secret: required("PUSHER_SECRET"),
      cluster: required("NEXT_PUBLIC_PUSHER_CLUSTER"),
      useTLS: true,
    });
  }
  return instance;
}
