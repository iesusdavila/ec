"use client";

import { useEffect, useRef } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { FruitSliceState } from "@/games/fruit-slice/logic";

const LIFETIME_MS = 1700;

export function FruitSliceMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const fruit = state as FruitSliceState | null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fruit) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    for (const obj of fruit.objects) {
      if (obj.sliced) continue;
      const progress = Math.min(1, (fruit.now - obj.spawnedAt) / LIFETIME_MS);
      const y = height * (0.15 + 0.6 * progress);
      const x = width * obj.x;
      const radius = 26;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = obj.kind === "bomb" ? "#3f3f46" : "#3ECF8E";
      ctx.fill();

      if (obj.kind === "bomb") {
        ctx.beginPath();
        ctx.arc(x, y - radius, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#FF6B5B";
        ctx.fill();
      }
    }
  }, [fruit]);

  if (!fruit) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const ranked = Object.entries(fruit.scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">Corta las frutas, evita las bombas</p>
        <p className="text-2xl font-mono tabular-nums">{Math.ceil(fruit.remainingMs / 1000)}s</p>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full rounded-2xl bg-surface" />
      <div className="flex flex-wrap justify-center gap-3">
        {ranked.map(([id, score]) => (
          <div key={id} className="rounded-full bg-surface border border-border px-4 py-2">
            {nameFor(id)}: <span className="font-semibold">{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
