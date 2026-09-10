"use client";

import type { GamePlayerProps } from "@/games/types";
import { GamepadPlayerView } from "@/games/runtime/GamepadPlayerView";
import type { PadInput } from "@/games/runtime/padInput";
import type { BombArenaPlayerState } from "@/games/bomb-arena/logic";

/** El teléfono es solo el mando: cruceta y bomba. La arena está en el monitor. */
export function BombArenaPlayerView({ myId, gameState, sendInput }: GamePlayerProps<PadInput>) {
  const state = gameState as BombArenaPlayerState | null;
  const alive = state?.alive?.[myId];
  const eliminated =
    state && alive === false
      ? { title: "Eliminado", detail: "Te alcanzó el fuego. Mira cómo termina." }
      : null;

  return (
    <GamepadPlayerView
      sendInput={sendInput}
      dpad="four"
      actions={[{ id: "bomb", label: "💣", aria: "Poner una bomba" }]}
      eliminated={eliminated}
    />
  );
}
