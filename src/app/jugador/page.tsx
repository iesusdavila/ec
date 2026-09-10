"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { FullscreenMessage } from "@/components/FullscreenMessage";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { SensorGate } from "@/components/SensorGate";
import { useSessionStore } from "@/core/session/useSessionStore";
import { usePresenceChannel } from "@/core/realtime/usePresenceChannel";
import { setLocalIdentity } from "@/core/realtime/pusherClient";
import { useChannelEvent } from "@/core/realtime/useChannelEvent";
import { RealtimeEvent } from "@/core/realtime/channel";
import { generateId } from "@/core/utils/id";
import { randomPlayerName } from "@/core/utils/playerName";
import { PLAYER_COLORS, type SessionStatus } from "@/core/types";
import { getGame } from "@/games";
import { GameRuntimePlayer } from "@/games/runtime/GameRuntimePlayer";

interface SessionStateMessage {
  status: SessionStatus;
  selectedGameId: string | null;
}

export default function JugadorPage() {
  const [pin, setPin] = useState<string | null>(null);
  const [name, setName] = useState(randomPlayerName());
  const [pinInput, setPinInput] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [myId] = useState(() => generateId("player"));
  const [color] = useState(() => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]);

  const store = useSessionStore();
  const identity = pin ? { id: myId, role: "player" as const, name, color } : null;
  const { channel, hostPresent, connectionState } = usePresenceChannel(pin, identity);

  useChannelEvent<SessionStateMessage>(channel, RealtimeEvent.SessionState, (message) => {
    store.applyRemoteSnapshot(message);
  });

  useChannelEvent(channel, RealtimeEvent.SessionClosed, () => {
    store.requestStatus("CLOSED");
  });

  // Si tras conectarnos no aparece un host en unos segundos, el PIN probablemente es incorrecto.
  useEffect(() => {
    if (connectionState !== "connected" || hostPresent) {
      queueMicrotask(() => setNotFound(false));
      return;
    }
    const timeout = setTimeout(() => setNotFound(true), 4000);
    return () => clearTimeout(timeout);
  }, [connectionState, hostPresent]);

  // Reiniciar la calibración cada vez que cambia el juego seleccionado.
  useEffect(() => {
    queueMicrotask(() => setCalibrated(false));
  }, [store.selectedGameId]);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pinInput.trim();
    if (!/^\d{4,6}$/.test(trimmed)) return;
    setLocalIdentity({ id: myId, role: "player", name, color });
    store.init("player", trimmed, myId);
    setPin(trimmed);
  }

  function handleExit() {
    store.reset();
    setPin(null);
    setPinInput("");
    setNotFound(false);
  }

  return (
    <>
      <ConnectionBanner state={connectionState} />
      {renderContent()}
    </>
  );

  function renderContent() {
  if (!pin) {
    return (
      <Screen>
        <h1 className="text-2xl font-semibold">Unirse a una partida</h1>
        <form onSubmit={handleConnect} className="flex flex-col items-center gap-4 w-full max-w-xs">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="Tu nombre"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg"
          />
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN"
            inputMode="numeric"
            autoFocus
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-3xl tracking-[0.3em] tabular-nums"
          />
          <Button type="submit" size="lg" className="w-full" disabled={pinInput.length < 4}>
            Conectarse
          </Button>
        </form>
        <Link href="/" className="text-muted underline text-sm">
          Volver
        </Link>
      </Screen>
    );
  }

  if (notFound) {
    return (
      <FullscreenMessage
        title="No encontramos esa sesión"
        description="Verifica el PIN con la persona que tiene la pantalla principal."
        actions={
          <Button variant="secondary" onClick={handleExit}>
            Intentar con otro PIN
          </Button>
        }
      />
    );
  }

  if (connectionState !== "connected" || !hostPresent) {
    return <FullscreenMessage title="Conectando…" />;
  }

  if (store.status === "CLOSED") {
    return (
      <FullscreenMessage
        title="La sesión terminó"
        actions={
          <Button variant="secondary" onClick={handleExit}>
            Volver al inicio
          </Button>
        }
      />
    );
  }

  const selectedGame = store.selectedGameId ? getGame(store.selectedGameId) : undefined;
  const inGame =
    selectedGame && (store.status === "PLAYING" || store.status === "PAUSED");

  // Los juegos que no usan sensores (p. ej. Simón dice, que ahora es de
  // botones) entran directo: pedir permiso de movimiento sin necesitarlo
  // solo agrega fricción y una alerta del navegador que confunde.
  if (inGame && !calibrated && selectedGame.requiredSensors.length > 0) {
    return (
      <SensorGate
        requireCalibration={selectedGame.needsCalibration}
        requirePositionTracking={selectedGame.needsPositionTracking ?? false}
        onDone={() => setCalibrated(true)}
      />
    );
  }

  if (inGame) {
    return (
      <main className="h-dvh w-full flex flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between px-4 py-2 border-b border-border">
          <span className="font-medium text-sm">{selectedGame.name}</span>
          <Button variant="ghost" size="md" onClick={handleExit}>
            Salir
          </Button>
        </header>
        {/* flex + min-h-0 para que la vista del juego (que usa flex-1) ocupe
            todo el alto disponible y quede centrada, no pegada al encabezado. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <GameRuntimePlayer
            definition={selectedGame}
            myId={myId}
            players={store.players}
            channel={channel}
          />
          {store.status === "PAUSED" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-2xl font-semibold">
              Pausado
            </div>
          )}
        </div>
      </main>
    );
  }

  if (store.status === "FINISHED") {
    return (
      <FullscreenMessage
        title="¡Partida terminada!"
        description="Mira el resultado en la pantalla principal."
        actions={
          <Button variant="ghost" onClick={handleExit}>
            Salir
          </Button>
        }
      />
    );
  }

  return (
    <Screen>
      <span
        className="h-4 w-4 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <h1 className="text-2xl font-semibold">Hola, {name}</h1>
      <p className="text-muted">Esperando a que el anfitrión inicie el juego…</p>
      <Button variant="ghost" onClick={handleExit}>
        Salir
      </Button>
    </Screen>
  );
  }
}
