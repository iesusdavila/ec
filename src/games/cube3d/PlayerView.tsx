"use client";

import { useEffect } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle, useTiltSnapshot } from "@/core/sensors/useSensors";
import type { Cube3dInput, Cube3dState } from "@/games/cube3d/logic";

const SEND_INTERVAL_MS = 50;

export function Cube3dPlayerView({ myId, gameState, sendInput }: GamePlayerProps<Cube3dInput>) {
  const cube3d = gameState as Cube3dState | null;
  const me = cube3d?.players.find((p) => p.id === myId);

  useSensorLifecycle(true);
  const tilt = useTiltSnapshot(true, SEND_INTERVAL_MS);

  useEffect(() => {
    const interval = setInterval(() => {
      const { beta, gamma } = sensorService.getTilt();
      sendInput({ gammaDeg: gamma, betaDeg: beta });
    }, SEND_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sendInput]);

  if (me?.finished) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xl font-semibold">¡Llegaste a la meta!</p>
      </div>
    );
  }

  const clampedX = Math.max(-30, Math.min(30, tilt.gamma));
  const clampedY = Math.max(-30, Math.min(30, tilt.beta));

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg font-medium">Inclina el teléfono para mover el cubo</p>
      <div className="relative h-40 w-40 rounded-full border border-border bg-surface">
        <div
          className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{
            left: `${50 + (clampedX / 30) * 42}%`,
            top: `${50 + (clampedY / 30) * 42}%`,
          }}
        />
      </div>
    </div>
  );
}
