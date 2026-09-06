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
import { GameOptionsPanel } from "@/app/monitor/GameOptionsPanel";
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
import type { GameLaunchOptions } from "@/games/types";

const HOST_COLOR = "#111113";
const DEFAULT_OPTIONS: GameLaunchOptions = { roundValue: 0, splitScreen: false };

export default function MonitorPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId] = useState(() => generateId("host"));
  const [gameOptions, setGameOptions] = useState<GameLaunchOptions>(DEFAULT_OPTIONS);
  const [launchToken, setLaunchToken] = useState(0);

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
    setGameOptions({ roundValue: getGame(id)?.duration?.default ?? 0, splitScreen: false });
    if (store.status === "WAITING_FOR_PLAYERS" || store.status === "READY") {
      store.requestStatus("SELECTING_GAME");
    }
  }

  function handleStart() {
    if (store.requestStatus("STARTING")) {
      setLaunchToken((n) => n + 1);
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

  function handlePlayAgain() {
    store.setLastResult(null);
    if (store.requestStatus("SELECTING_GAME") && store.requestStatus("READY") && store.requestStatus("STARTING")) {
      setLaunchToken((n) => n + 1);
      store.requestStatus("PLAYING");
    }
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
      // h-dvh + overflow-hidden: el juego ocupa exactamente el alto de la
      // ventana. Con min-h-dvh el escenario podía desbordarse por abajo y
      // obligaba a hacer scroll durante la partida.
      <main className="h-dvh w-full flex flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between px-6 py-2 border-b border-border lg:px-10 lg:py-3">
          <span className="font-semibold lg:text-2xl">{selectedGame.name}</span>
          <div className="flex gap-2 lg:gap-3">
            <Button variant="secondary" onClick={handleTogglePause}>
              {store.status === "PAUSED" ? "Reanudar" : "Pausar"}
            </Button>
            <Button variant="danger" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </header>
        {/* flex + min-h-0 para que la vista del juego ocupe todo el alto
            disponible y pueda encogerse: los juegos usan flex-1 y sin min-h-0
            un hijo flex nunca baja de su alto de contenido. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GameRuntimeHost
            key={`${selectedGame.id}-${launchToken}`}
            definition={selectedGame}
            players={players}
            channel={channel}
            options={gameOptions}
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
        <ResultScreen
          result={store.lastResult}
          players={players}
          onContinue={handleContinue}
          onPlayAgain={handlePlayAgain}
        />
      </Screen>
    );
  }

  const canStart = Boolean(selectedGame) && store.status === "READY";

  return (
    <Screen>
      <div className="flex shrink-0 flex-col items-center gap-4 lg:gap-6">
        <PinDisplay pin={pin} />
        <PlayerList players={players} maxPlayers={selectedGame?.maxPlayers} />
      </div>

      {/* Zona elástica: si la ventana es muy baja, es esto lo que se encoge
          (y como último recurso se desplaza por dentro), en vez de empujar el
          botón de iniciar fuera de la pantalla. */}
      <div className="flex w-full min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto lg:gap-5">
        <p className="shrink-0 text-muted lg:text-xl">Elige un juego</p>
        <GameGrid
          games={games}
          selectedId={store.selectedGameId}
          playerCount={players.length}
          onSelect={handleSelectGame}
        />
        {selectedGame && (selectedGame.duration || selectedGame.supportsSplitScreen) ? (
          <GameOptionsPanel game={selectedGame} options={gameOptions} onChange={setGameOptions} />
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <Button size="xl" disabled={!canStart} onClick={handleStart}>
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
