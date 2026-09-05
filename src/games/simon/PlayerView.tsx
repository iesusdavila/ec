"use client";

import { useEffect, useRef, useState } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import type { SimonState, Direction } from "@/games/simon/logic";

// Umbral deliberadamente alto: debe sentirse como "inclinar con intención",
// no reaccionar a cualquier temblor de la mano. Ver README sección 6:
// "la detección debe ser tolerante, no exigir movimientos extremadamente
// precisos" — pero eso significa exigir un gesto claro, no uno ambiguo.
const ARM_THRESHOLD = 34;
const RELEASE_THRESHOLD = 16;
/** El eje ganador debe superar claramente al otro para evitar diagonales ambiguas. */
const DOMINANCE_RATIO = 1.3;
/** Muestras seguidas con la misma dirección antes de aceptarla (filtra ruido). */
const CONFIRM_SAMPLES = 3;
const SAMPLE_MS = 30;
/** Suavizado exponencial de la lectura cruda del sensor. */
const SMOOTHING = 0.35;

function directionFromTilt(beta: number, gamma: number): Direction | null {
  const absB = Math.abs(beta);
  const absG = Math.abs(gamma);
  if (absB < ARM_THRESHOLD && absG < ARM_THRESHOLD) return null;

  if (absB >= absG) {
    if (absG > 0 && absB < absG * DOMINANCE_RATIO) return null;
    return beta > 0 ? "down" : "up";
  }
  if (absB > 0 && absG < absB * DOMINANCE_RATIO) return null;
  return gamma > 0 ? "right" : "left";
}

export function SimonPlayerView({ myId, gameState, sendInput }: GamePlayerProps<Direction>) {
  const simon = gameState as SimonState | null;
  const [live, setLive] = useState<Direction | null>(null);
  const armedRef = useRef(false);
  const smoothedRef = useRef({ beta: 0, gamma: 0 });
  const pendingRef = useRef<{ direction: Direction; count: number } | null>(null);

  useSensorLifecycle(true);

  const me = simon?.players.find((p) => p.id === myId);
  const canPlay = simon?.phase === "input" && me?.alive && !me.completedRound;

  useEffect(() => {
    const interval = setInterval(() => {
      const raw = sensorService.getTilt();
      const smoothed = smoothedRef.current;
      smoothed.beta += (raw.beta - smoothed.beta) * SMOOTHING;
      smoothed.gamma += (raw.gamma - smoothed.gamma) * SMOOTHING;

      const direction = directionFromTilt(smoothed.beta, smoothed.gamma);
      setLive(direction);

      if (!canPlay) {
        pendingRef.current = null;
        return;
      }

      if (armedRef.current) {
        if (Math.abs(smoothed.beta) < RELEASE_THRESHOLD && Math.abs(smoothed.gamma) < RELEASE_THRESHOLD) {
          armedRef.current = false;
        }
        return;
      }

      if (!direction) {
        pendingRef.current = null;
        return;
      }

      if (pendingRef.current?.direction === direction) {
        pendingRef.current.count += 1;
      } else {
        pendingRef.current = { direction, count: 1 };
      }

      if (pendingRef.current.count >= CONFIRM_SAMPLES) {
        armedRef.current = true;
        pendingRef.current = null;
        sendInput(direction);
      }
    }, SAMPLE_MS);
    return () => clearInterval(interval);
  }, [canPlay, sendInput]);

  if (!simon) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  if (me && !me.alive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xl font-semibold">Eliminado</p>
        <p className="text-muted">Sobreviviste {me.roundsSurvived} niveles. Observa el resto.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg font-medium">
        {simon.phase === "showing" ? "Memoriza…" : "¡Inclina el teléfono con firmeza!"}
      </p>
      {me?.completedRound && (
        <p className="text-muted">Listo, esperando a los demás…</p>
      )}
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-48 h-48">
        <div />
        <Pad active={live === "up"}>↑</Pad>
        <div />
        <Pad active={live === "left"}>←</Pad>
        <div className="rounded-xl bg-surface" />
        <Pad active={live === "right"}>→</Pad>
        <div />
        <Pad active={live === "down"}>↓</Pad>
        <div />
      </div>
    </div>
  );
}

function Pad({ active, children }: { active: boolean; children: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl text-2xl font-semibold transition-colors ${
        active ? "bg-accent text-accent-foreground" : "bg-surface"
      }`}
    >
      {children}
    </div>
  );
}
