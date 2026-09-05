"use client";

import { useEffect, useRef, useState } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useGesture, useSensorLifecycle } from "@/core/sensors/useSensors";
import type { RaceInput, RaceState } from "@/games/race/logic";

const LANE_THRESHOLD = 15;

export function RacePlayerView({ myId, gameState, sendInput }: GamePlayerProps<RaceInput>) {
  const race = gameState as RaceState | null;
  const laneRef = useRef<0 | 1 | 2>(1);
  const [lane, setLane] = useState<0 | 1 | 2>(1);
  const [pulse, setPulse] = useState(false);

  useSensorLifecycle(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const { gamma } = sensorService.getTilt();
      const next: 0 | 1 | 2 = gamma < -LANE_THRESHOLD ? 0 : gamma > LANE_THRESHOLD ? 2 : 1;
      if (next !== laneRef.current) {
        laneRef.current = next;
        setLane(next);
        sendInput({ type: "lane", lane: next });
      }
    }, 80);
    return () => clearInterval(interval);
  }, [sendInput]);

  useGesture(true, () => {
    sendInput({ type: "advance" });
    setPulse(true);
    setTimeout(() => setPulse(false), 120);
  });

  const me = race?.players.find((p) => p.id === myId);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-xl font-semibold">Agita para avanzar</p>
      <p className="text-muted">Inclina a los lados para cambiar de carril</p>

      <div className="flex gap-3">
        {[0, 1, 2].map((l) => (
          <div
            key={l}
            className={`h-10 w-10 rounded-lg border ${
              lane === l ? "bg-accent border-accent" : "border-border"
            }`}
          />
        ))}
      </div>

      <div
        className={`h-20 w-20 rounded-full border-4 transition-colors ${
          pulse ? "bg-accent border-accent" : "border-border"
        }`}
      />

      {me?.finished && <p className="font-semibold">¡Llegaste a la meta!</p>}
      {me && me.cooldownMs > 0 && <p className="text-sm text-muted">Tropezaste, espera un momento…</p>}
    </div>
  );
}
