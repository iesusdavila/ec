"use client";

import { useRef, useState } from "react";
import type { GamePlayerProps } from "@/games/types";
import type { SimonState, Direction } from "@/games/simon/logic";

/** Evita que un doble toque accidental envíe la misma dirección dos veces. */
const PRESS_COOLDOWN_MS = 180;

const PAD_LAYOUT: (Direction | null)[] = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

const ARROWS: Record<Direction, string> = {
  N: "↑",
  NE: "↗",
  E: "→",
  SE: "↘",
  S: "↓",
  SW: "↙",
  W: "←",
  NW: "↖",
};

export function SimonPlayerView({ myId, gameState, sendInput }: GamePlayerProps<Direction>) {
  const simon = gameState as SimonState | null;
  const [pressed, setPressed] = useState<Direction | null>(null);
  const cooldownRef = useRef(false);

  const me = simon?.players.find((p) => p.id === myId);
  const canPlay = Boolean(simon?.phase === "input" && me?.alive && !me.completedRound);

  function handlePress(direction: Direction) {
    if (!canPlay || cooldownRef.current) return;
    cooldownRef.current = true;
    setPressed(direction);
    sendInput(direction);
    setTimeout(() => {
      cooldownRef.current = false;
    }, PRESS_COOLDOWN_MS);
    setTimeout(() => setPressed(null), 150);
  }

  if (!simon) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  if (me && !me.alive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xl font-semibold">Eliminado</p>
        <p className="text-muted">Sobreviviste {me.roundsSurvived} niveles. Observa el resto.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg font-medium">
        {simon.phase === "showing" ? "Memoriza…" : "¡Toca la secuencia!"}
      </p>
      {me && (
        <p className="text-sm text-muted" aria-label={`${me.lives} vidas restantes`}>
          {"♥".repeat(me.lives)}
        </p>
      )}
      {me?.completedRound && <p className="text-muted">Listo, esperando a los demás…</p>}

      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-64 h-64">
        {PAD_LAYOUT.map((direction, i) =>
          direction ? (
            <button
              key={direction}
              disabled={!canPlay}
              onClick={() => handlePress(direction)}
              style={{ touchAction: "manipulation" }}
              className={`flex items-center justify-center rounded-xl text-3xl font-semibold transition-colors disabled:opacity-40 ${
                pressed === direction ? "bg-accent text-accent-foreground" : "bg-surface"
              }`}
            >
              {ARROWS[direction]}
            </button>
          ) : (
            <div key={`center-${i}`} className="rounded-xl bg-surface/40" />
          )
        )}
      </div>
    </div>
  );
}
