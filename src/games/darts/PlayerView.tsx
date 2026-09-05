"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import type { DartsState, DartsInput } from "@/games/darts/logic";

const AIM_SAMPLE_MS = 60;
const AIM_RANGE_DEG = 35;

function readAim(): { x: number; y: number } {
  const { beta, gamma } = sensorService.getTilt();
  return {
    x: Math.max(-1, Math.min(1, gamma / AIM_RANGE_DEG)),
    y: Math.max(-1, Math.min(1, beta / AIM_RANGE_DEG)),
  };
}

export function DartsPlayerView({ myId, gameState, sendInput }: GamePlayerProps<DartsInput>) {
  const darts = gameState as DartsState | null;
  const isMyTurn = darts?.currentPlayerId === myId;
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useSensorLifecycle(true);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!isMyTurn || intervalRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setHolding(true);
    const aim = readAim();
    sendInput({ type: "aim", ...aim });
    intervalRef.current = setInterval(() => {
      sendInput({ type: "aim", ...readAim() });
    }, AIM_SAMPLE_MS);
  }

  function stopAiming() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setHolding(false);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const wasHolding = intervalRef.current !== null;
    stopAiming();
    if (wasHolding && isMyTurn) {
      sendInput({ type: "throw" });
    }
  }

  function handlePointerCancel() {
    stopAiming();
  }

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
      <p className="text-lg font-medium">
        {holding ? "Inclina el teléfono para apuntar…" : "Mantén presionado y apunta"}
      </p>
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{ touchAction: "none" }}
        className={`flex h-48 w-48 select-none items-center justify-center rounded-full border-4 text-lg font-semibold transition-colors ${
          holding ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
        }`}
      >
        {holding ? "Suelta para lanzar" : "Mantener"}
      </button>
      <p className="text-sm text-muted">
        Sujeta el teléfono, presiona y sin soltar inclínalo para apuntar. Suelta para lanzar.
      </p>
    </div>
  );
}
