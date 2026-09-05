"use client";

import { useEffect } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useGesture, useSensorLifecycle } from "@/core/sensors/useSensors";
import type { DartsState, DartsInput } from "@/games/darts/logic";

const AIM_SAMPLE_MS = 60;
const AIM_RANGE_DEG = 40;

export function DartsPlayerView({ myId, gameState, sendInput }: GamePlayerProps<DartsInput>) {
  const darts = gameState as DartsState | null;
  const isMyTurn = darts?.currentPlayerId === myId;

  useSensorLifecycle(true);

  useEffect(() => {
    if (!isMyTurn) return;
    const interval = setInterval(() => {
      const { gamma } = sensorService.getTilt();
      const x = Math.max(-1, Math.min(1, gamma / AIM_RANGE_DEG));
      sendInput({ type: "aim", x });
    }, AIM_SAMPLE_MS);
    return () => clearInterval(interval);
  }, [isMyTurn, sendInput]);

  useGesture(isMyTurn, (gesture) => {
    sendInput({ type: "throw", intensity: gesture.intensity });
  });

  if (!darts) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  if (!isMyTurn) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xl font-semibold">Espera tu turno</p>
        <p className="text-muted">Puntaje actual: {darts.scores[myId] ?? 0}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-xl font-semibold">Inclina para apuntar</p>
      <div className="relative h-4 w-56 rounded-full bg-surface border border-border">
        <div
          className="absolute top-1/2 h-6 w-6 -translate-y-1/2 -translate-x-1/2 rounded-full bg-accent"
          style={{ left: `${50 + darts.aimX * 45}%` }}
        />
      </div>
      <p className="text-muted">Haz un gesto de lanzar para tirar</p>
    </div>
  );
}
