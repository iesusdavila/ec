import type { GameMonitorProps } from "@/games/types";
import type { DartsState } from "@/games/darts/logic";
import { GameStage } from "@/components/GameStage";
import { DartIcon } from "@/components/icons/GameIcons";

/** Anillos del tablero, de afuera hacia adentro (diámetro en % y color). */
const RINGS = [
  { diameter: 90, color: "#3f3f46" },
  { diameter: 65, color: "#e4e4e7" },
  { diameter: 40, color: "#5B8CFF" },
  { diameter: 20, color: "#e4e4e7" },
  { diameter: 8, color: "#FF6B5B" },
];

/** Convierte una coordenada de puntería (-1..1) a porcentaje dentro del tablero. */
function toPct(v: number): number {
  return 50 + v * 45;
}

export function DartsMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const darts = state as DartsState | null;
  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  if (!darts) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 lg:p-10">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold lg:text-2xl">
          Turno de {darts.currentPlayerId ? nameFor(darts.currentPlayerId) : "—"}
        </p>
        {darts.lastThrow ? (
          <p className="text-muted lg:text-lg">
            {nameFor(darts.lastThrow.playerId)} anotó {darts.lastThrow.points}
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <GameStage aspectRatio="1 / 1" className="max-w-[min(80vh,100%)]">
          {RINGS.map((ring) => (
            <div
              key={ring.diameter}
              className="absolute rounded-full"
              style={{
                width: `${ring.diameter}%`,
                height: `${ring.diameter}%`,
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: ring.color,
              }}
            />
          ))}

          {darts.phase === "aiming" && (
            <div
              className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-lg"
              style={{ left: `${toPct(darts.aimX)}%`, top: `${toPct(darts.aimY)}%` }}
            />
          )}

          {darts.lastThrow && (
            <div
              className="absolute h-24 w-24 -translate-x-1/2 -translate-y-full lg:h-32 lg:w-32"
              style={{
                left: `${toPct(darts.lastThrow.x)}%`,
                top: `${toPct(darts.lastThrow.y)}%`,
              }}
            >
              <DartIcon className="h-full w-full drop-shadow-lg" />
            </div>
          )}
        </GameStage>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {darts.turnOrder.map((id) => (
          <div
            key={id}
            className={`rounded-full border px-4 py-2 lg:px-6 lg:py-3 lg:text-lg ${
              id === darts.currentPlayerId ? "border-accent" : "border-border"
            }`}
          >
            {nameFor(id)}: <span className="font-semibold">{darts.scores[id]}</span>
            <span className="text-muted"> · {darts.throwsTaken[id]}/{darts.throwsPerPlayer}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
