"use client";

import { useEffect, useRef, useState } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import type { SimonState, Direction } from "@/games/simon/logic";

const ARM_THRESHOLD = 20;
const RELEASE_THRESHOLD = 10;
const SAMPLE_MS = 30;

function directionFromTilt(beta: number, gamma: number): Direction | null {
  if (Math.abs(beta) < ARM_THRESHOLD && Math.abs(gamma) < ARM_THRESHOLD) return null;
  if (Math.abs(beta) > Math.abs(gamma)) {
    return beta > 0 ? "down" : "up";
  }
  return gamma > 0 ? "right" : "left";
}

export function SimonPlayerView({ myId, gameState, sendInput }: GamePlayerProps<Direction>) {
  const simon = gameState as SimonState | null;
  const [live, setLive] = useState<Direction | null>(null);
  const armedRef = useRef(false);

  useSensorLifecycle(true);

  const me = simon?.players.find((p) => p.id === myId);
  const canPlay = simon?.phase === "input" && me?.alive && !me.completedRound;

  useEffect(() => {
    const interval = setInterval(() => {
      const { beta, gamma } = sensorService.getTilt();
      const direction = directionFromTilt(beta, gamma);
      setLive(direction);

      if (!canPlay) return;

      if (!armedRef.current && direction) {
        armedRef.current = true;
        sendInput(direction);
      } else if (armedRef.current && Math.abs(beta) < RELEASE_THRESHOLD && Math.abs(gamma) < RELEASE_THRESHOLD) {
        armedRef.current = false;
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
        {simon.phase === "showing" ? "Memoriza…" : "¡Inclina el teléfono!"}
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
