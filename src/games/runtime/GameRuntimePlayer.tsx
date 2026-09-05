"use client";

import { useEffect, useState } from "react";
import type { PresenceChannel } from "pusher-js";
import type { GameDefinition } from "@/games/types";
import type { Player } from "@/core/types";
import { RealtimeEvent } from "@/core/realtime/channel";
import { sendClientEvent, useChannelEvent } from "@/core/realtime/useChannelEvent";

interface GameStateMessage {
  gameId: string;
  state: unknown;
}

interface GameRuntimePlayerProps {
  definition: GameDefinition;
  myId: string;
  players: Player[];
  channel: PresenceChannel | null;
}

/**
 * Lado del jugador: renderiza los controles del juego activo y reenvía los
 * gestos/entradas al host, además de mantener el último snapshot público
 * recibido para que la interfaz pueda reaccionar (p. ej. mostrar puntaje).
 */
export function GameRuntimePlayer({ definition, myId, players, channel }: GameRuntimePlayerProps) {
  const [gameState, setGameState] = useState<unknown>(null);

  // Este componente solo se monta una vez pasado el permiso de sensores y la
  // calibración (ver jugador/page.tsx), así que es el momento exacto en el
  // que este teléfono ya puede jugar: se lo avisamos al host para que no
  // arranque el reloj de la ronda mientras alguien sigue calibrando.
  useEffect(() => {
    sendClientEvent(channel, RealtimeEvent.PlayerReady, { playerId: myId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useChannelEvent<GameStateMessage>(channel, RealtimeEvent.GameState, (message) => {
    if (message.gameId !== definition.id) return;
    setGameState(message.state);
  });

  const sendInput = (input: unknown) => {
    sendClientEvent(channel, RealtimeEvent.PlayerInput, {
      playerId: myId,
      gameId: definition.id,
      payload: input,
    });
  };

  const PlayerComponent = definition.PlayerComponent;
  return (
    <PlayerComponent
      myId={myId}
      players={players}
      gameState={gameState}
      sendInput={sendInput}
    />
  );
}
