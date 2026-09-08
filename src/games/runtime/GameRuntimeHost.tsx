"use client";

import { useEffect, useRef, useState } from "react";
import type { PresenceChannel } from "pusher-js";
import type { GameDefinition, GameEngine, GameLaunchOptions } from "@/games/types";
import type { GameResult, Player } from "@/core/types";
import { RealtimeEvent } from "@/core/realtime/channel";
import { sendClientEvent, useChannelEvent } from "@/core/realtime/useChannelEvent";
import { clientEventBudget } from "@/core/realtime/clientEventBudget";
import { LatencyEstimator, type ClockEcho } from "@/core/realtime/clockSync";

/**
 * Cada cuánto se REVISA si toca emitir. No es la frecuencia de emisión: quien
 * manda ahí es `clientEventBudget`, que garantiza no pasarse del límite de
 * Pusher. Revisar más a menudo que el espaciado mínimo solo sirve para que un
 * cambio de estado salga cuanto antes en vez de esperar al siguiente hueco.
 */
const BROADCAST_CHECK_MS = 25;
/** Si algún teléfono no avisa que está listo (permiso/calibración) en este
 * tiempo, se arranca de todas formas para no dejar la partida bloqueada. */
const READY_TIMEOUT_MS = 6000;
/**
 * Reenvío periódico del último estado conocido, independiente de que haya
 * cambiado. Los juegos por turnos (p. ej. Dardos) solo emiten estado en
 * momentos puntuales (una vez al iniciar, una vez por tirada); si ese único
 * mensaje se pierde en la red, un jugador se queda esperando para siempre.
 * Esta retransmisión de reconciliación garantiza que, en menos de un
 * segundo, todos terminan viendo el estado real sin importar si algún
 * mensaje individual no llegó.
 */
const HEARTBEAT_MS = 600;

interface PlayerInputMessage {
  playerId: string;
  gameId: string;
  payload: unknown;
  /** Eco de reloj para medir la latencia de este teléfono (clockSync.ts). */
  echo?: ClockEcho;
}

interface PlayerReadyMessage {
  playerId: string;
}

interface GameRuntimeHostProps {
  definition: GameDefinition;
  players: Player[];
  channel: PresenceChannel | null;
  options: GameLaunchOptions;
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
  options,
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
  /** Latencia medida por jugador, para que el motor compense la puntería. */
  const latencyRef = useRef<Map<string, LatencyEstimator>>(new Map());

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

    // ---------------------------------------------------------------------
    // Emisión de snapshots a los teléfonos.
    //
    // El motor cambia de estado hasta 60 veces por segundo, pero Pusher solo
    // admite 10 eventos/s por conexión y descarta el resto EN SILENCIO. Antes
    // se emitía cada 70 ms (~14/s) más un heartbeat, o sea por encima del
    // límite: Pusher tiraba mensajes al azar y nadie se enteraba (§7.5).
    //
    // Ahora se emite solo cuando hay hueco de cuota Y hay algo que contar:
    //
    //  - Se compara la proyección serializada con la última enviada. Si no
    //    cambió, no se manda: para un juego donde el teléfono es solo un mando
    //    esto ahorra casi toda la cuota, que es justo lo que hace falta para
    //    que las entradas del jugador lleguen sin cola.
    //  - El heartbeat deja de ser un temporizador aparte (que se sumaba a la
    //    cuota sin saberlo) y pasa a ser una condición más: "hace demasiado
    //    que no se manda nada, reenvía por si se perdió algo".
    // ---------------------------------------------------------------------
    const project = definition.toPlayerState ?? ((state: unknown) => state);

    let latestSnapshot: unknown = null;
    let lastSentJson: string | null = null;
    let lastSentAt = 0;

    const flushSnapshot = (now: number) => {
      if (latestSnapshot === null) return;
      // La cuota se mira PRIMERO: es una comparación de números, mientras que
      // serializar el estado no lo es. Al revés, el monitor estaría
      // serializando la partida entera 40 veces por segundo para tirar tres de
      // cada cuatro resultados.
      if (!clientEventBudget.canStream(now)) return;

      const payload = project(latestSnapshot);
      const json = JSON.stringify(payload);
      const changed = json !== lastSentJson;
      const stale = now - lastSentAt >= HEARTBEAT_MS;
      if (!changed && !stale) return;

      lastSentJson = json;
      lastSentAt = now;
      clientEventBudget.noteStream(now);
      sendClientEvent(channel, RealtimeEvent.GameState, {
        gameId: definition.id,
        state: payload,
        // Sello de reloj para que los teléfonos puedan devolverlo y el host
        // mida la latencia real de cada uno. Ver core/realtime/clockSync.ts.
        t: now,
      });
    };

    const engine = definition.createEngine({
      players,
      options,
      onStateChange: (next) => {
        latestSnapshot = next;
        setStateBox({ value: next });
      },
    });
    engineRef.current = engine;

    const broadcastTimer = setInterval(() => flushSnapshot(Date.now()), BROADCAST_CHECK_MS);

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
      clearInterval(broadcastTimer);
      cancelAnimationFrame(raf);
      engine.cleanup();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  useChannelEvent<PlayerInputMessage>(channel, RealtimeEvent.PlayerInput, (message) => {
    if (message.gameId !== definition.id || pausedRef.current) return;

    let estimator = latencyRef.current.get(message.playerId);
    if (!estimator) {
      estimator = new LatencyEstimator();
      latencyRef.current.set(message.playerId, estimator);
    }
    estimator.addEcho(message.echo, Date.now());

    engineRef.current?.handleInput(message.playerId, message.payload, {
      latencyMs: estimator.oneWayMs,
    });
  });

  if (waiting) {
    return (
      <div className="flex flex-1 items-center justify-center text-lg text-muted lg:text-2xl">
        Esperando a los jugadores… ({readyCount}/{players.length})
      </div>
    );
  }

  const MonitorComponent = definition.MonitorComponent;
  return <MonitorComponent state={stateBox.value} players={players} />;
}
