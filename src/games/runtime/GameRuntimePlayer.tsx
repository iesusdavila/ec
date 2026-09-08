"use client";

import { useEffect, useRef, useState } from "react";
import type { PresenceChannel } from "pusher-js";
import type { GameDefinition } from "@/games/types";
import type { Player } from "@/core/types";
import { RealtimeEvent } from "@/core/realtime/channel";
import { sendClientEvent, useChannelEvent } from "@/core/realtime/useChannelEvent";
import { createClockEchoTracker } from "@/core/realtime/clockSync";

interface GameStateMessage {
  gameId: string;
  state: unknown;
  /** Sello de reloj del host, si lo trae (ver core/realtime/clockSync.ts). */
  t?: number;
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
  // Un rastreador por partida: apunta el último sello del host y cuánto lleva
  // retenido, para devolvérselo con la siguiente entrada.
  const [clockEcho] = useState(createClockEchoTracker);

  // Lo que `sendInput` necesita saber y puede cambiar entre renders. Va en un
  // ref (actualizado en un efecto, nunca durante el render) para que la función
  // de envío pueda ser estable.
  const targetRef = useRef({ channel, gameId: definition.id, myId });
  useEffect(() => {
    targetRef.current = { channel, gameId: definition.id, myId };
  });

  // `sendInput` y `getClockEcho` NO deben cambiar de identidad entre renders:
  // los juegos con control continuo los guardan en un ref y los llaman desde un
  // bucle de animación. Si se recrearan, cada snapshot recibido obligaría a
  // reconstruir ese bucle, que es justo lo que no puede pasar en el teléfono
  // mientras se está apuntando.
  const [api] = useState(() => ({
    sendInput: (input: unknown) => {
      const target = targetRef.current;
      sendClientEvent(target.channel, RealtimeEvent.PlayerInput, {
        playerId: target.myId,
        gameId: target.gameId,
        payload: input,
        echo: clockEcho.read(),
      });
    },
    getClockEcho: () => clockEcho.read(),
  }));

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
    if (typeof message.t === "number") clockEcho.note(message.t);
    setGameState(message.state);
  });

  const PlayerComponent = definition.PlayerComponent;
  return (
    <PlayerComponent
      myId={myId}
      players={players}
      gameState={gameState}
      sendInput={api.sendInput}
      getClockEcho={api.getClockEcho}
    />
  );
}
