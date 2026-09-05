"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Screen } from "@/components/Screen";
import { PinDisplay } from "@/components/PinDisplay";
import { PlayerList } from "@/components/PlayerList";
import { Button } from "@/components/Button";
import { FullscreenMessage } from "@/components/FullscreenMessage";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { GameGrid } from "@/app/monitor/GameGrid";
import { ResultScreen } from "@/app/monitor/ResultScreen";
import { useSessionStore } from "@/core/session/useSessionStore";
import { usePresenceChannel } from "@/core/realtime/usePresenceChannel";
import { setLocalIdentity } from "@/core/realtime/pusherClient";
import { RealtimeEvent } from "@/core/realtime/channel";
import { sendClientEvent } from "@/core/realtime/useChannelEvent";
import { canStartGame } from "@/core/session/sessionMachine";
import { generateId } from "@/core/utils/id";
import { getGame, listGames } from "@/games";
import { GameRuntimeHost } from "@/games/runtime/GameRuntimeHost";
import type { GameResult } from "@/core/types";

const HOST_COLOR = "#111113";

export default function MonitorPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId] = useState(() => generateId("host"));

  const store = useSessionStore();
  const { channel, players, connectionState } = usePresenceChannel(
    pin,
    pin ? { id: myId, role: "host", name: "Monitor", color: HOST_COLOR } : null
  );

  const games = listGames();
  const selectedGame = store.selectedGameId ? getGame(store.selectedGameId) : undefined;

  // Crear la sesión (PIN) al entrar a la pantalla de monitor.
  useEffect(() => {
    let cancelled = false;
    setLocalIdentity({ id: myId, role: "host", name: "Monitor", color: HOST_COLOR });

    fetch("/api/session/create", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        store.init("host", data.pin, myId);
        setPin(data.pin);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo crear la sesión. Revisa tu conexión.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una vez conectado al canal, salir de CREATED.
  useEffect(() => {
    if (connectionState === "connected" && store.status === "CREATED") {
      store.requestStatus("WAITING_FOR_PLAYERS");
    }
  }, [connectionState, store]);

  // Recalcular disponibilidad del juego seleccionado si cambia la cantidad de jugadores.
  useEffect(() => {
    if (!selectedGame) return;
    const ready = canStartGame(selectedGame, players.length);
    if (ready && store.status === "SELECTING_GAME") {
      store.requestStatus("READY");
    } else if (!ready && store.status === "READY") {
      store.requestStatus("SELECTING_GAME");
    }
  }, [players.length, selectedGame, store]);

  // Transmitir el estado de la sesión a los jugadores conectados. Se
  // reenvía periódicamente (no solo al cambiar) porque es un solo mensaje
  // por transición: si Pusher lo pierde, un jugador se quedaría viendo la
  // pantalla anterior para siempre sin este reintento de reconciliación.
  useEffect(() => {
    if (!channel) return;
    const send = () => {
      sendClientEvent(channel, RealtimeEvent.SessionState, {
        status: store.status,
        selectedGameId: store.selectedGameId,
      });
    };
    send();
    const interval = setInterval(send, 1000);
    return () => clearInterval(interval);
  }, [channel, store.status, store.selectedGameId]);

  // Avisar a los jugadores si el monitor se cierra.
  useEffect(() => {
    const handler = () => sendClientEvent(channel, RealtimeEvent.SessionClosed, {});
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [channel]);

  function handleSelectGame(id: string) {
    if (store.selectedGameId === id) {
      store.setSelectedGameId(null);
      store.requestStatus("WAITING_FOR_PLAYERS");
      return;
    }
    store.setSelectedGameId(id);
    if (store.status === "WAITING_FOR_PLAYERS" || store.status === "READY") {
      store.requestStatus("SELECTING_GAME");
    }
  }

  function handleStart() {
    if (store.requestStatus("STARTING")) {
      store.requestStatus("PLAYING");
    }
  }

  function handleTogglePause() {
    if (store.status === "PLAYING") store.requestStatus("PAUSED");
    else if (store.status === "PAUSED") store.requestStatus("PLAYING");
  }

  function handleCancel() {
    store.requestStatus("SELECTING_GAME");
  }

  function handleFinish(result: GameResult) {
    store.setLastResult(result);
    store.requestStatus("FINISHED");
  }

  function handleContinue() {
    store.setLastResult(null);
    store.requestStatus("SELECTING_GAME");
  }

  return (
    <>
      <ConnectionBanner state={connectionState} />
      {renderContent()}
    </>
  );

  function renderContent() {
  if (error) {
    return (
      <FullscreenMessage
        title="No se pudo iniciar el monitor"
        description={error}
        actions={
          <Link href="/">
            <Button variant="secondary">Volver al inicio</Button>
          </Link>
        }
      />
    );
  }

  if (!pin || store.status === "CREATED") {
    return <FullscreenMessage title="Generando sesión…" />;
  }

  if (store.status === "PLAYING" || store.status === "PAUSED" || store.status === "STARTING") {
    if (!selectedGame) {
      return <FullscreenMessage title="Juego no encontrado" />;
    }
    return (
      <main className="min-h-dvh w-full flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="font-semibold">{selectedGame.name}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleTogglePause}>
              {store.status === "PAUSED" ? "Reanudar" : "Pausar"}
            </Button>
            <Button variant="danger" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </header>
        <div className="flex-1 relative">
          <GameRuntimeHost
            definition={selectedGame}
            players={players}
            channel={channel}
            paused={store.status === "PAUSED"}
            onFinish={handleFinish}
          />
          {store.status === "PAUSED" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-3xl font-semibold">
              Pausado
            </div>
          )}
        </div>
      </main>
    );
  }

  if (store.status === "FINISHED" && store.lastResult) {
    return (
      <Screen>
        <ResultScreen result={store.lastResult} players={players} onContinue={handleContinue} />
      </Screen>
    );
  }

  const canStart = Boolean(selectedGame) && store.status === "READY";

  return (
    <Screen>
      <PinDisplay pin={pin} />
      <PlayerList players={players} maxPlayers={selectedGame?.maxPlayers} />

      <div className="flex flex-col items-center gap-4 w-full">
        <p className="text-muted">Elige un juego</p>
        <GameGrid
          games={games}
          selectedId={store.selectedGameId}
          playerCount={players.length}
          onSelect={handleSelectGame}
        />
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button size="lg" disabled={!canStart} onClick={handleStart}>
          Iniciar partida
        </Button>
        {selectedGame && !canStart ? (
          <p className="text-sm text-muted">
            Necesitas entre {selectedGame.minPlayers} y {selectedGame.maxPlayers} jugadores
            conectados.
          </p>
        ) : null}
      </div>
    </Screen>
  );
  }
}
