"use client";

import { useEffect, useRef, useState } from "react";
import type { PresenceChannel } from "pusher-js";
import type { GameDefinition, GameEngine } from "@/games/types";
import type { GameResult, Player } from "@/core/types";
import { RealtimeEvent } from "@/core/realtime/channel";
import { sendClientEvent, useChannelEvent } from "@/core/realtime/useChannelEvent";
import { throttle } from "@/core/utils/throttle";

const BROADCAST_INTERVAL_MS = 70;
/** Si algún teléfono no avisa que está listo (permiso/calibración) en este
 * tiempo, se arranca de todas formas para no dejar la partida bloqueada. */
const READY_TIMEOUT_MS = 6000;

interface PlayerInputMessage {
  playerId: string;
  gameId: string;
  payload: unknown;
}

interface PlayerReadyMessage {
  playerId: string;
}

interface GameRuntimeHostProps {
  definition: GameDefinition;
  players: Player[];
  channel: PresenceChannel | null;
  paused?: boolean;
  onFinish: (result: GameResult) => void;
}

/**
 * Orquesta la ejecución de un juego en el monitor: crea el motor, conecta
 * las entradas de los jugadores, hace avanzar la simulación y transmite
 * snapshots de estado a los teléfonos. El propio motor del juego no sabe
 * nada de Pusher ni de React: solo expone start/handleInput/tick/getState.
 *
 * El reloj del juego no arranca hasta que todos los jugadores confirman que
 * ya terminaron su permiso de sensores/calibración (o hasta un tiempo
 * máximo de espera), para no descontarles tiempo de reacción mientras su
 * teléfono todavía está en la pantalla de calibración.
 */
export function GameRuntimeHost({
  definition,
  players,
  channel,
  paused = false,
  onFinish,
}: GameRuntimeHostProps) {
  const [stateBox, setStateBox] = useState<{ value: unknown }>({ value: null });
  const [readyCount, setReadyCount] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const engineRef = useRef<GameEngine | null>(null);
  const finishedRef = useRef(false);
  const pausedRef = useRef(paused);
  const readyIdsRef = useRef<Set<string>>(new Set());
  const tryBeginRef = useRef<() => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useChannelEvent<PlayerReadyMessage>(channel, RealtimeEvent.PlayerReady, ({ playerId }) => {
    readyIdsRef.current.add(playerId);
    setReadyCount(readyIdsRef.current.size);
    tryBeginRef.current();
  });

  useEffect(() => {
    finishedRef.current = false;
    readyIdsRef.current = new Set();
    queueMicrotask(() => {
      setReadyCount(0);
      setWaiting(true);
    });

    const requiredIds = players.map((p) => p.id);

    const broadcast = throttle((snapshot: unknown) => {
      sendClientEvent(channel, RealtimeEvent.GameState, {
        gameId: definition.id,
        state: snapshot,
      });
    }, BROADCAST_INTERVAL_MS);

    const engine = definition.createEngine({
      players,
      onStateChange: (next) => {
        setStateBox({ value: next });
        broadcast(next);
      },
    });
    engineRef.current = engine;

    let started = false;
    let raf = 0;
    let last = 0;

    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current) {
        engine.tick(dt);
      }
      if (!finishedRef.current && engine.isFinished()) {
        finishedRef.current = true;
        onFinish(engine.getResult());
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const begin = () => {
      if (started) return;
      started = true;
      clearTimeout(fallbackTimeout);
      setWaiting(false);
      // engine.start() invoca context.onStateChange (todos los motores lo
      // hacen en su implementación de start), publicando el snapshot inicial.
      engine.start();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const tryBegin = () => {
      if (requiredIds.every((id) => readyIdsRef.current.has(id))) {
        begin();
      }
    };
    tryBeginRef.current = tryBegin;
    const fallbackTimeout = setTimeout(begin, READY_TIMEOUT_MS);
    tryBegin();

    return () => {
      clearTimeout(fallbackTimeout);
      cancelAnimationFrame(raf);
      engine.cleanup();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  useChannelEvent<PlayerInputMessage>(channel, RealtimeEvent.PlayerInput, (message) => {
    if (message.gameId !== definition.id || pausedRef.current) return;
    engineRef.current?.handleInput(message.playerId, message.payload);
  });

  if (waiting) {
    return (
      <div className="flex flex-1 items-center justify-center text-lg text-muted">
        Esperando a los jugadores… ({readyCount}/{players.length})
      </div>
    );
  }

  const MonitorComponent = definition.MonitorComponent;
  return <MonitorComponent state={stateBox.value} players={players} />;
}
