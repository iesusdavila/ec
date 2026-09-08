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

function labelFor(unit: "seconds" | "throws" | "lives"): string {
  if (unit === "throws") return "Tiros por jugador";
  if (unit === "lives") return "Vidas por jugador";
  return "Duración";
}

/**
 * Panel de configuración previo a iniciar una partida: duración de la ronda
 * (o tiros por jugador, según el juego) y, si aplica, modo compartido o
 * pantalla dividida. Solo se muestra lo que el juego seleccionado soporta.
 *
 * Va AL LADO de la cuadrícula de juegos, no debajo. Debajo competía por el
 * alto con la propia cuadrícula y con el botón de iniciar, que es lo que
 * empujaba a hacer scroll en pantallas normales; en una columna lateral ese
 * alto ya está pagado. En móvil no hay sitio para dos columnas y vuelve abajo.
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
    <aside className="flex w-full max-w-xl shrink-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 lg:w-56 lg:gap-5 lg:p-5">
      {game.duration && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {labelFor(game.duration.unit)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {presetsFor(game.duration).map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={options.roundValue === value}
                onClick={() => onChange({ ...options, roundValue: value })}
              >
                {formatValue(value, game.duration!.unit)}
              </button>
            ))}
          </div>
        </section>
      )}

      {game.supportsSplitScreen && (
        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Modo</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="chip"
              aria-pressed={!options.splitScreen}
              onClick={() => onChange({ ...options, splitScreen: false })}
            >
              Compartido
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={options.splitScreen}
              onClick={() => onChange({ ...options, splitScreen: true })}
            >
              Pantalla dividida
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
