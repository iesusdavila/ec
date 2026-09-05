import type { GameMonitorProps } from "@/games/types";
import type { RaceState } from "@/games/race/logic";
import { GameStage } from "@/components/GameStage";
import { CarIcon, HurdleIcon } from "@/components/icons/GameIcons";

export function RaceMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const race = state as RaceState | null;

  if (!race) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const ranked = [...race.players].sort((a, b) => b.progress - a.progress);
  const laneCount = 3;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <GameStage aspectRatio="16 / 7" className="flex-1">
        {/* Carriles de fondo */}
        <div className="absolute inset-0 flex flex-col">
          {Array.from({ length: laneCount }).map((_, lane) => (
            <div
              key={lane}
              className={`flex-1 ${lane % 2 === 0 ? "bg-surface" : "bg-background"}`}
            />
          ))}
        </div>

        {/* Meta */}
        <div className="absolute right-0 top-0 h-full w-[1.5%]" style={{ backgroundColor: "#FF6B5B" }} />

        {race.obstacles.map((obstacle) => (
          <div
            key={obstacle.id}
            className="absolute h-[26%] w-[4%] -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${(obstacle.position / race.trackLength) * 100}%`,
              top: `${((obstacle.lane + 0.5) / laneCount) * 100}%`,
            }}
          >
            <HurdleIcon className="h-full w-full" />
          </div>
        ))}

        {race.players.map((p, index) => {
          const color = players.find((pl) => pl.id === p.id)?.color ?? "#5B8CFF";
          const verticalNudge = index % 2 === 0 ? -10 : 10;
          return (
            <div
              key={p.id}
              className="absolute h-[20%] w-[9%] -translate-x-1/2 -translate-y-1/2 transition-[left] duration-100 ease-linear"
              style={{
                left: `${(p.progress / race.trackLength) * 100}%`,
                top: `calc(${((p.lane + 0.5) / laneCount) * 100}% + ${verticalNudge}%)`,
              }}
            >
              <CarIcon className="h-full w-full" color={color} />
            </div>
          );
        })}
      </GameStage>

      <div className="flex flex-wrap justify-center gap-3">
        {ranked.map((p) => (
          <div key={p.id} className="rounded-full bg-surface border border-border px-4 py-2">
            {nameFor(p.id)}: {Math.round((p.progress / race.trackLength) * 100)}%
            {p.finished ? " · meta" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
