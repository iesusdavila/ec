import type { ReactElement } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { FruitSliceState, ObjectKind } from "@/games/fruit-slice/logic";
import { GameStage, StageObject } from "@/components/GameStage";
import {
  AppleIcon,
  BananaIcon,
  BombIcon,
  OrangeIcon,
  SliceFlash,
  WatermelonIcon,
} from "@/components/icons/GameIcons";

const OBJECT_LIFETIME_MS = 2000;
const SLICE_LINGER_MS = 450;

const ICONS: Record<ObjectKind, (props: { className?: string }) => ReactElement> = {
  apple: AppleIcon,
  watermelon: WatermelonIcon,
  orange: OrangeIcon,
  banana: BananaIcon,
  bomb: BombIcon,
};

/** Arco parabólico: sube y vuelve a caer, como un lanzamiento real. */
function arcHeight(progress: number): number {
  return 0.85 - 0.6 * Math.sin(progress * Math.PI);
}

export function FruitSliceMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const fruit = state as FruitSliceState | null;

  if (!fruit) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const ranked = Object.entries(fruit.scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">Corta las frutas, evita las bombas</p>
        <p className="text-2xl font-mono tabular-nums">{Math.ceil(fruit.remainingMs / 1000)}s</p>
      </div>

      <GameStage aspectRatio="16 / 10" className="flex-1">
        {fruit.objects.map((obj) => {
          const Icon = ICONS[obj.kind];
          const age = obj.sliced ? obj.slicedAt ?? fruit.now : fruit.now;
          const progress = Math.min(1, (age - obj.spawnedAt) / OBJECT_LIFETIME_MS);
          const y = arcHeight(progress);
          const sliceProgress = obj.sliced
            ? Math.min(1, (fruit.now - (obj.slicedAt ?? fruit.now)) / SLICE_LINGER_MS)
            : 0;

          if (obj.sliced) {
            return (
              <StageObject
                key={obj.id}
                x={obj.x}
                y={y}
                worldWidth={1}
                worldHeight={1}
                size={13}
                style={{ opacity: 1 - sliceProgress }}
              >
                <div className="relative h-full w-full">
                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: "inset(0 50% 0 0)",
                      transform: `translate(${-sliceProgress * 60}%, ${sliceProgress * 40}%) rotate(${-sliceProgress * 50}deg)`,
                    }}
                  >
                    <Icon className="h-full w-full" />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: "inset(0 0 0 50%)",
                      transform: `translate(${sliceProgress * 60}%, ${sliceProgress * 40}%) rotate(${sliceProgress * 50}deg)`,
                    }}
                  >
                    <Icon className="h-full w-full" />
                  </div>
                  {sliceProgress < 0.3 && (
                    <SliceFlash className="absolute inset-0 h-full w-full" />
                  )}
                </div>
              </StageObject>
            );
          }

          return (
            <StageObject key={obj.id} x={obj.x} y={y} worldWidth={1} worldHeight={1} size={13}>
              <Icon className="h-full w-full drop-shadow" />
            </StageObject>
          );
        })}
      </GameStage>

      <div className="flex flex-wrap justify-center gap-3">
        {ranked.map(([id, score]) => (
          <div key={id} className="rounded-full bg-surface border border-border px-4 py-2">
            {nameFor(id)}: <span className="font-semibold">{score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
