"use client";

import PusherClient from "pusher-js";
import type { Channel, PresenceChannel } from "pusher-js";
import type { Role } from "@/core/types";

export interface LocalIdentity {
  id: string;
  role: Role;
  name: string;
  color: string;
}

let client: PusherClient | null = null;
let identity: LocalIdentity | null = null;

/**
 * Debe llamarse antes de suscribirse a un canal: define quién es "yo" en
 * esta pestaña (host de monitor o jugador). El autorizador del canal
 * presence envía esta identidad al endpoint /api/pusher/auth para que el
 * resto de participantes la vea en la lista de miembros.
 */
export function setLocalIdentity(next: LocalIdentity): void {
  identity = next;
}

export function getLocalIdentity(): LocalIdentity | null {
  return identity;
}

/**
 * Instancia única de Pusher en el navegador.
 * Se conecta de forma perezosa (solo cuando se solicita el primer canal).
 */
export function getPusherClient(): PusherClient {
  if (!client) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      throw new Error(
        "Faltan NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER. Copia .env.example a .env.local."
      );
    }
    client = new PusherClient(key, {
      cluster,
      authorizer: (channel) => ({
        authorize(socketId, callback) {
          fetch("/api/pusher/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
              identity,
            }),
          })
            .then(async (res) => {
              if (!res.ok) {
                throw new Error(`Auth de canal falló (${res.status})`);
              }
              return res.json();
            })
            .then((data) => callback(null, data))
            .catch((err) => callback(err as Error, null));
        },
      }),
    });
  }
  return client;
}

export function disconnectPusherClient(): void {
  client?.disconnect();
  client = null;
  identity = null;
}

export type { Channel, PresenceChannel };
