"use client";

import { useState } from "react";
import type { GamePlayerProps } from "@/games/types";
import { useGesture, useSensorLifecycle } from "@/core/sensors/useSensors";

export function FruitSlicePlayerView({ sendInput }: GamePlayerProps<Record<string, never>>) {
  const [flash, setFlash] = useState(false);

  useSensorLifecycle(true);
  useGesture(true, () => {
    sendInput({});
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xl font-semibold">¡Agita el teléfono para cortar!</p>
      <div
        className={`h-24 w-24 rounded-full border-4 transition-colors ${
          flash ? "bg-accent border-accent" : "border-border"
        }`}
      />
    </div>
  );
}
