"use client";

import { useEffect, useState } from "react";
import type { PresenceChannel } from "pusher-js";
import { getPusherClient, type LocalIdentity } from "@/core/realtime/pusherClient";
import { sessionChannelName } from "@/core/realtime/channel";
import type { Player } from "@/core/types";

interface MemberInfo {
  role: "host" | "player";
  name: string;
  color: string;
  joinedAt: number;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "unavailable"
  | "failed";

interface UsePresenceChannelResult {
  channel: PresenceChannel | null;
  players: Player[];
  hostPresent: boolean;
  connectionState: ConnectionState;
}

/**
 * Se suscribe al canal presence de una sesión (identificada por PIN) y
 * mantiene sincronizada la lista de jugadores conectados a partir de los
 * eventos nativos de presencia de Pusher (member_added / member_removed).
 *
 * Libera la suscripción y los listeners al desmontar o al cambiar de PIN,
 * evitando fugas de conexiones (ver sección 14/26 del README: limpieza de
 * listeners y estados inválidos).
 */
export function usePresenceChannel(
  pin: string | null,
  identity: LocalIdentity | null
): UsePresenceChannelResult {
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostPresent, setHostPresent] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [channel, setChannel] = useState<PresenceChannel | null>(null);

  useEffect(() => {
    if (!pin || !identity) {
      return;
    }

    const pusher = getPusherClient();
    const channelName = sessionChannelName(pin);
    queueMicrotask(() => setConnectionState("connecting"));

    const activeChannel = pusher.subscribe(channelName) as PresenceChannel;
    queueMicrotask(() => setChannel(activeChannel));

    const syncFromMembers = () => {
      const nextPlayers: Player[] = [];
      let host = false;
      activeChannel.members.each((member: { id: string; info: MemberInfo }) => {
        if (member.info.role === "host") {
          host = true;
          return;
        }
        nextPlayers.push({
          id: member.id,
          name: member.info.name,
          color: member.info.color,
          joinedAt: member.info.joinedAt,
        });
      });
      nextPlayers.sort((a, b) => a.joinedAt - b.joinedAt);
      setPlayers(nextPlayers);
      setHostPresent(host);
    };

    const onSubscribed = () => {
      setConnectionState("connected");
      syncFromMembers();
    };
    const onMemberChange = () => syncFromMembers();
    const onConnectionState = () => {
      const state = pusher.connection.state;
      if (state === "connected") setConnectionState("connected");
      else if (state === "connecting") setConnectionState("connecting");
      else if (state === "unavailable") setConnectionState("unavailable");
      else if (state === "failed") setConnectionState("failed");
    };

    activeChannel.bind("pusher:subscription_succeeded", onSubscribed);
    activeChannel.bind("pusher:member_added", onMemberChange);
    activeChannel.bind("pusher:member_removed", onMemberChange);
    pusher.connection.bind("state_change", onConnectionState);

    return () => {
      activeChannel.unbind("pusher:subscription_succeeded", onSubscribed);
      activeChannel.unbind("pusher:member_added", onMemberChange);
      activeChannel.unbind("pusher:member_removed", onMemberChange);
      pusher.connection.unbind("state_change", onConnectionState);
      pusher.unsubscribe(channelName);
      setChannel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, identity?.id]);

  return {
    channel,
    players,
    hostPresent,
    connectionState,
  };
}
