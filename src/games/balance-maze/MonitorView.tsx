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
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">{balance.levelName}</p>
        <p className="text-2xl font-mono tabular-nums">{Math.ceil(balance.remainingMs / 1000)}s</p>
      </div>

      <GameStage aspectRatio={`${WORLD_WIDTH} / ${WORLD_HEIGHT}`} className="flex-1">
        {balance.walls.map((wall, i) => (
          <div
            key={`wall-${i}`}
            className="absolute bg-[#3f3f46]"
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
            className="absolute bg-[#FF6B5B]/35"
            style={{
              left: pct(hazard.x, WORLD_WIDTH),
              top: pct(hazard.y, WORLD_HEIGHT),
              width: pct(hazard.w, WORLD_WIDTH),
              height: pct(hazard.h, WORLD_HEIGHT),
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
          }}
        />

        {balance.players.map((player) => {
          const color = players.find((p) => p.id === player.id)?.color ?? "#5B8CFF";
          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow"
              style={{
                left: pct(player.x, WORLD_WIDTH),
                top: pct(player.y, WORLD_HEIGHT),
                width: pct(28, WORLD_WIDTH),
                height: pct(28, WORLD_HEIGHT),
                backgroundColor: color,
              }}
            />
          );
        })}
      </GameStage>
    </div>
  );
}
