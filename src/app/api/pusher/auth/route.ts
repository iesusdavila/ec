import { NextResponse } from "next/server";
import { getPusherServer } from "@/core/realtime/pusherServer";
import { pinFromChannelName } from "@/core/realtime/channel";
import type { Role } from "@/core/types";

interface AuthBody {
  socket_id: string;
  channel_name: string;
  identity: {
    id: string;
    role: Role;
    name: string;
    color: string;
  } | null;
}

/**
 * Firma la autorización de canales "presence-session-*".
 *
 * No hay base de datos ni cuentas: cualquier participante que conozca el PIN
 * (compartido físicamente en la misma sala) puede unirse. Este endpoint solo
 * traduce la identidad elegida en el cliente (host o jugador) al formato que
 * Pusher necesita para exponerla como miembro del canal presence.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as AuthBody;
  const { socket_id, channel_name, identity } = body;

  if (!socket_id || !channel_name) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const pin = pinFromChannelName(channel_name);
  if (!pin) {
    return NextResponse.json({ error: "Canal no permitido" }, { status: 403 });
  }

  if (!identity || !identity.id || !identity.name || !identity.role) {
    return NextResponse.json({ error: "Identidad requerida" }, { status: 400 });
  }

  const authResponse = getPusherServer().authorizeChannel(socket_id, channel_name, {
    user_id: identity.id,
    user_info: {
      role: identity.role,
      name: identity.name,
      color: identity.color,
      joinedAt: Date.now(),
    },
  });

  return NextResponse.json(authResponse);
}
