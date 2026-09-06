import type { GameMonitorProps } from "@/games/types";
import type { BalanceState } from "@/games/balance-maze/logic";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@/games/balance-maze/levels";
import { GameStage } from "@/components/GameStage";

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

export function BalanceMazeMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const balance = state as BalanceState | null;

  if (!balance) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 lg:p-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold lg:text-2xl">{balance.levelName}</p>
          <p className="text-sm text-muted lg:text-base">
            Niveles completados: {balance.levelsCompleted}
          </p>
        </div>
        <p className="text-2xl font-mono tabular-nums lg:text-4xl">
          {Math.ceil(balance.remainingMs / 1000)}s
        </p>
      </div>

      <GameStage aspectRatio={`${WORLD_WIDTH} / ${WORLD_HEIGHT}`} className="flex-1">
        {balance.walls.map((wall, i) => (
          <div
            key={`wall-${i}`}
            className="absolute rounded-sm bg-[#3f3f46]"
            style={{
              left: pct(wall.x, WORLD_WIDTH),
              top: pct(wall.y, WORLD_HEIGHT),
              width: pct(wall.w, WORLD_WIDTH),
              height: pct(wall.h, WORLD_HEIGHT),
            }}
          />
        ))}

        {balance.hazards.map((hazard, i) => (
          <div
            key={`hazard-${i}`}
            className="absolute rounded-sm border border-[#FF6B5B]/50"
            style={{
              left: pct(hazard.x, WORLD_WIDTH),
              top: pct(hazard.y, WORLD_HEIGHT),
              width: pct(hazard.w, WORLD_WIDTH),
              height: pct(hazard.h, WORLD_HEIGHT),
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,107,91,0.45) 0 8px, rgba(255,107,91,0.2) 8px 16px)",
            }}
          />
        ))}

        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3ECF8E]"
          style={{
            left: pct(balance.goal.x, WORLD_WIDTH),
            top: pct(balance.goal.y, WORLD_HEIGHT),
            width: pct(balance.goal.r * 2, WORLD_WIDTH),
            height: pct(balance.goal.r * 2, WORLD_HEIGHT),
            boxShadow: "0 0 0 6px rgba(62,207,142,0.25)",
          }}
        />

        {balance.players.map((player) => {
          const color = players.find((p) => p.id === player.id)?.color ?? "#5B8CFF";
          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
              style={{
                left: pct(player.x, WORLD_WIDTH),
                top: pct(player.y, WORLD_HEIGHT),
                width: pct(28, WORLD_WIDTH),
                height: pct(28, WORLD_HEIGHT),
                backgroundImage: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7), ${color} 60%)`,
                boxShadow: "0 3px 6px rgba(0,0,0,0.35)",
              }}
            />
          );
        })}
      </GameStage>
    </div>
  );
}
