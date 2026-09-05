"use client";

import { useEffect, useRef } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { DartsState } from "@/games/darts/logic";

const RING_COLORS = ["#3f3f46", "#ffffff", "#5B8CFF", "#ffffff", "#FF6B5B"];

export function DartsMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const darts = state as DartsState | null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !darts) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) * 0.42;

    RING_COLORS.forEach((color, i) => {
      const radius = maxRadius * (1 - i / RING_COLORS.length);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Indicador de puntería actual mientras el jugador activo apunta.
    const aimX = cx + darts.aimX * maxRadius;
    ctx.beginPath();
    ctx.moveTo(aimX, height);
    ctx.lineTo(aimX, height - 24);
    ctx.strokeStyle = "var(--color-accent)";
    ctx.lineWidth = 4;
    ctx.stroke();

    if (darts.lastThrow) {
      const px = cx + darts.lastThrow.x * maxRadius;
      const py = cy + darts.lastThrow.y * maxRadius;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#111113";
      ctx.fill();
    }
  }, [darts]);

  if (!darts) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">
          Turno de {darts.currentPlayerId ? nameFor(darts.currentPlayerId) : "—"}
        </p>
        {darts.lastThrow ? (
          <p className="text-muted">
            {nameFor(darts.lastThrow.playerId)} anotó {darts.lastThrow.points}
          </p>
        ) : null}
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full rounded-2xl bg-surface" />
      <div className="flex flex-wrap justify-center gap-3">
        {darts.turnOrder.map((id) => (
          <div
            key={id}
            className={`rounded-full border px-4 py-2 ${
              id === darts.currentPlayerId ? "border-accent" : "border-border"
            }`}
          >
            {nameFor(id)}: <span className="font-semibold">{darts.scores[id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
