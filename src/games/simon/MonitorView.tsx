import type { GameMonitorProps } from "@/games/types";
import type { SimonState, Direction } from "@/games/simon/logic";

const ARROWS: Record<Direction, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

export function SimonMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const simon = state as SimonState | null;

  if (!simon) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-muted">Nivel {simon.round}</p>

      <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
        {simon.sequence.map((direction, index) => {
          const isCurrent = simon.phase === "showing" && index === simon.showIndex;
          return (
            <span
              key={index}
              className={`flex h-20 w-20 items-center justify-center rounded-2xl border text-4xl transition-colors ${
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

      <p className="text-xl font-medium">
        {simon.phase === "showing" ? "Memoriza la secuencia…" : "¡Reproduce la secuencia!"}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {simon.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 ${
              p.alive ? "border-border bg-surface" : "border-border bg-surface opacity-40"
            }`}
          >
            <span className="font-medium">{nameFor(p.id)}</span>
            <span className="text-muted text-sm">
              {p.alive
                ? `${p.progress}/${simon.sequence.length}`
                : `eliminado · ${p.roundsSurvived}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
