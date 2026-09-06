import type { GameMonitorProps } from "@/games/types";
import type { SimonState, Direction } from "@/games/simon/logic";

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

export function SimonMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const simon = state as SimonState | null;

  if (!simon) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-muted lg:text-lg">
        Nivel {simon.round}
      </p>

      <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
        {simon.sequence.map((direction, index) => {
          const isCurrent = simon.phase === "showing" && index === simon.showIndex;
          return (
            <span
              key={index}
              className={`flex h-20 w-20 items-center justify-center rounded-2xl border text-4xl transition-colors lg:h-28 lg:w-28 lg:text-6xl ${
                isCurrent
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-surface border-border"
              }`}
            >
              {ARROWS[direction]}
            </span>
          );
        })}
      </div>

      <p className="text-xl font-medium lg:text-3xl">
        {simon.phase === "showing" ? "Memoriza la secuencia…" : "¡Reproduce la secuencia!"}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {simon.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 lg:px-6 lg:py-3 lg:text-lg ${
              p.alive ? "border-border bg-surface" : "border-border bg-surface opacity-40"
            }`}
          >
            <span className="font-medium">{nameFor(p.id)}</span>
            <span className="text-muted text-sm lg:text-base">
              {p.alive
                ? `${p.progress}/${simon.sequence.length}`
                : `eliminado · ${p.roundsSurvived}`}
            </span>
            {p.alive && (
              <span className="text-sm lg:text-base" aria-label={`${p.lives} vidas`}>
                {"♥".repeat(p.lives)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
