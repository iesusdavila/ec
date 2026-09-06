import type { GameDefinition, GameLaunchOptions } from "@/games/types";

function presetsFor(duration: NonNullable<GameDefinition["duration"]>): number[] {
  const values: number[] = [];
  for (let v = duration.min; v <= duration.max; v += duration.step) {
    values.push(v);
  }
  return values;
}

function formatValue(value: number, unit: "seconds" | "throws" | "lives"): string {
  if (unit === "throws") return `${value} tiros`;
  if (unit === "lives") return value === 1 ? "1 vida" : `${value} vidas`;
  // Segundos siempre: convertir a minutos redondea valores distintos (p. ej.
  // 90s y 105s) a la misma etiqueta "2 min", lo que confunde más de lo que ayuda.
  return `${value}s`;
}

/**
 * Panel de configuración previo a iniciar una partida: duración de la ronda
 * (o tiros por jugador, según el juego) y, si aplica, modo compartido o
 * pantalla dividida. Solo se muestra lo que el juego seleccionado soporta.
 */
export function GameOptionsPanel({
  game,
  options,
  onChange,
}: {
  game: GameDefinition;
  options: GameLaunchOptions;
  onChange: (next: GameLaunchOptions) => void;
}) {
  if (!game.duration && !game.supportsSplitScreen) return null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-4">
      {game.duration && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted lg:text-base">
            {game.duration.unit === "throws"
              ? "Tiros por jugador"
              : game.duration.unit === "lives"
                ? "Vidas por jugador"
                : "Duración de la ronda"}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {presetsFor(game.duration).map((value) => (
              <button
                key={value}
                onClick={() => onChange({ ...options, roundValue: value })}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  options.roundValue === value
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border hover:bg-surface-strong"
                }`}
              >
                {formatValue(value, game.duration!.unit)}
              </button>
            ))}
          </div>
        </div>
      )}

      {game.supportsSplitScreen && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted">Modo</p>
          <div className="flex gap-2">
            <button
              onClick={() => onChange({ ...options, splitScreen: false })}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                !options.splitScreen
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border hover:bg-surface-strong"
              }`}
            >
              Compartido
            </button>
            <button
              onClick={() => onChange({ ...options, splitScreen: true })}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                options.splitScreen
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border hover:bg-surface-strong"
              }`}
            >
              Pantalla dividida
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
