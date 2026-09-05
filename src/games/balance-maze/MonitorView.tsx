"use client";

import { useEffect, useRef } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { BalanceState } from "@/games/balance-maze/logic";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@/games/balance-maze/levels";

export function BalanceMazeMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const balance = state as BalanceState | null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !balance) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    const offsetX = (width - WORLD_WIDTH * scale) / 2;
    const offsetY = (height - WORLD_HEIGHT * scale) / 2;
    const toX = (x: number) => offsetX + x * scale;
    const toY = (y: number) => offsetY + y * scale;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "var(--color-surface)";
    ctx.fillRect(offsetX, offsetY, WORLD_WIDTH * scale, WORLD_HEIGHT * scale);

    ctx.fillStyle = "#3f3f46";
    for (const wall of balance.walls) {
      ctx.fillRect(toX(wall.x), toY(wall.y), wall.w * scale, wall.h * scale);
    }

    ctx.fillStyle = "rgba(255,107,91,0.35)";
    for (const hazard of balance.hazards) {
      ctx.fillRect(toX(hazard.x), toY(hazard.y), hazard.w * scale, hazard.h * scale);
    }

    ctx.beginPath();
    ctx.arc(toX(balance.goal.x), toY(balance.goal.y), balance.goal.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#3ECF8E";
    ctx.fill();

    for (const player of balance.players) {
      const color = players.find((p) => p.id === player.id)?.color ?? "#5B8CFF";
      ctx.beginPath();
      ctx.arc(toX(player.x), toY(player.y), 14 * scale, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "var(--color-background)";
      ctx.stroke();
    }
  }, [balance, players]);

  if (!balance) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">{balance.levelName}</p>
        <p className="text-2xl font-mono tabular-nums">{Math.ceil(balance.remainingMs / 1000)}s</p>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full rounded-2xl" />
    </div>
  );
}
