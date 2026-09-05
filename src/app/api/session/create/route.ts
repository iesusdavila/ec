import { NextResponse } from "next/server";
import { getPusherServer } from "@/core/realtime/pusherServer";
import { sessionChannelName } from "@/core/realtime/channel";

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

interface ChannelInfoResponse {
  occupied?: boolean;
  user_count?: number;
}

/**
 * Genera un PIN de 4 dígitos libre (sin miembros conectados actualmente en
 * su canal). No requiere base de datos: se apoya en el estado que ya
 * mantiene Pusher para los canales presence.
 */
export async function POST() {
  const pusher = getPusherServer();

  for (let attempt = 0; attempt < 5; attempt++) {
    const pin = randomPin();
    try {
      const info = (await pusher.get({
        path: `/channels/${sessionChannelName(pin)}`,
        params: { info: "user_count" },
      }).then((res) => res.json())) as ChannelInfoResponse;

      if (!info.user_count) {
        return NextResponse.json({ pin });
      }
    } catch {
      // Si la consulta falla, asumimos el PIN libre en vez de bloquear la creación.
      return NextResponse.json({ pin });
    }
  }

  return NextResponse.json(
    { error: "No se pudo generar un PIN libre, intenta de nuevo." },
    { status: 503 }
  );
}
