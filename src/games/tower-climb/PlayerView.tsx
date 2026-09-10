"use client";

import type { GamePlayerProps } from "@/games/types";
import { GamepadPlayerView } from "@/games/runtime/GamepadPlayerView";
import type { PadInput } from "@/games/runtime/padInput";
import type { TowerPlayerState } from "@/games/tower-climb/logic";

/**
 * El teléfono es solo el mando: izquierda, derecha y saltar. La torre se ve en
 * el monitor, no aquí.
 */
export function TowerClimbPlayerView({ myId, gameState, sendInput }: GamePlayerProps<PadInput>) {
  const state = gameState as TowerPlayerState | null;
  const lives = state?.lives?.[myId];
  const eliminated =
    state && lives === 0
      ? { title: "Sin vidas", detail: "Te quedaste abajo. Mira cómo acaban los demás." }
      : null;

  return (
    <GamepadPlayerView
      sendInput={sendInput}
      dpad="horizontal"
      actions={[{ id: "jump", label: "SALTAR", aria: "Saltar" }]}
      eliminated={eliminated}
    />
  );
}
