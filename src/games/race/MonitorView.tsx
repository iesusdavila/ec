"use client";

import { useEffect, useRef } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { RaceState } from "@/games/race/logic";

export function RaceMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const race = state as RaceState | null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !race) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const laneHeight = height / 3;
    const trackWidth = width - 40;

    for (let lane = 0; lane < 3; lane++) {
      ctx.fillStyle = lane % 2 === 0 ? "var(--color-surface)" : "var(--color-background)";
      ctx.fillRect(0, lane * laneHeight, width, laneHeight);
    }

    ctx.fillStyle = "#FF6B5B";
    ctx.fillRect(width - 12, 0, 6, height);

    for (const obstacle of race.obstacles) {
      const x = 20 + (obstacle.position / race.trackLength) * trackWidth;
      const y = obstacle.lane * laneHeight + laneHeight / 2;
      ctx.fillStyle = "#3f3f46";
      ctx.fillRect(x - 6, y - 14, 12, 28);
    }

    race.players.forEach((p, index) => {
      const color = players.find((pl) => pl.id === p.id)?.color ?? "#5B8CFF";
      const x = 20 + (p.progress / race.trackLength) * trackWidth;
      const y = p.lane * laneHeight + laneHeight / 2 + (index % 2 === 0 ? -10 : 10);
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }, [race, players]);

  if (!race) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const ranked = [...race.players].sort((a, b) => b.progress - a.progress);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <canvas ref={canvasRef} className="flex-1 w-full rounded-2xl bg-surface" />
      <div className="flex flex-wrap justify-center gap-3">
        {ranked.map((p) => (
          <div key={p.id} className="rounded-full bg-surface border border-border px-4 py-2">
            {nameFor(p.id)}: {Math.round((p.progress / race.trackLength) * 100)}%
            {p.finished ? " · meta" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
