import type { ReactElement } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { FruitLane, FruitSliceState, ObjectKind } from "@/games/fruit-slice/logic";
import { GameStage } from "@/components/GameStage";
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
const SHAKE_MS = 400;

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

function shakeOffset(now: number, lastBombAt: number | null): number {
  if (lastBombAt === null) return 0;
  const t = now - lastBombAt;
  if (t > SHAKE_MS) return 0;
  const decay = 1 - t / SHAKE_MS;
  return Math.sin(t / 22) * 7 * decay;
}

export function FruitSliceMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const fruit = state as FruitSliceState | null;

  if (!fruit) {
    return <div className="flex flex-1 items-center justify-center">Cargando…</div>;
  }

  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const colorFor = (id: string) => players.find((p) => p.id === id)?.color ?? "#5B8CFF";
  const ranked = Object.entries(fruit.scores).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 lg:p-10">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold lg:text-2xl">Corta las frutas, evita las bombas</p>
        <p className="text-2xl font-mono tabular-nums lg:text-4xl">
          {Math.ceil(fruit.remainingMs / 1000)}s
        </p>
      </div>

      <div className="flex flex-1 gap-3">
        {fruit.lanes.map((lane, laneIndex) => (
          <div key={laneIndex} className="flex flex-1 flex-col gap-2">
            {fruit.splitScreen && (
              <div className="flex items-center justify-center gap-2">
                <span
                  className="h-3 w-3 rounded-full lg:h-4 lg:w-4"
                  style={{ backgroundColor: colorFor(lane.playerIds[0]) }}
                  aria-hidden
                />
                <span className="font-medium lg:text-lg">{nameFor(lane.playerIds[0])}</span>
                <span className="text-muted lg:text-lg">
                  {fruit.scores[lane.playerIds[0]] ?? 0}
                </span>
              </div>
            )}
            <FruitLaneStage
              lane={lane}
              laneIndex={laneIndex}
              now={fruit.now}
              popups={fruit.popups}
            />
          </div>
        ))}
      </div>

      {!fruit.splitScreen && (
        <div className="flex flex-wrap justify-center gap-3">
          {ranked.map(([id, score]) => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-full bg-surface border border-border px-4 py-2 lg:px-6 lg:py-3 lg:text-lg"
            >
              <span
                className="h-3 w-3 rounded-full lg:h-4 lg:w-4"
                style={{ backgroundColor: colorFor(id) }}
                aria-hidden
              />
              {nameFor(id)}: <span className="font-semibold">{score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FruitLaneStage({
  lane,
  laneIndex,
  now,
  popups,
}: {
  lane: FruitLane;
  laneIndex: number;
  now: number;
  popups: FruitSliceState["popups"];
}) {
  const offset = shakeOffset(now, lane.lastBombAt);
  const exploding = lane.lastBombAt !== null && now - lane.lastBombAt < SHAKE_MS;

  return (
    <GameStage aspectRatio="4 / 3" className="flex-1" style={{ transform: `translateX(${offset}px)` }}>
      {exploding && lane.lastBombAt !== null && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: "#FF6B5B",
            opacity: Math.max(0, 0.35 * (1 - (now - lane.lastBombAt) / SHAKE_MS)),
          }}
        />
      )}

      {lane.objects.map((obj) => {
        const Icon = ICONS[obj.kind];
        const age = obj.sliced ? obj.slicedAt ?? now : now;
        const progress = Math.min(1, (age - obj.spawnedAt) / OBJECT_LIFETIME_MS);
        const y = arcHeight(progress);
        const sliceProgress = obj.sliced
          ? Math.min(1, (now - (obj.slicedAt ?? now)) / SLICE_LINGER_MS)
          : 0;

        if (obj.sliced) {
          return (
            <div
              key={obj.id}
              className="absolute"
              style={{
                left: `${obj.x * 100}%`,
                top: `${y * 100}%`,
                width: "13%",
                aspectRatio: "1 / 1",
                transform: "translate(-50%, -50%)",
                opacity: 1 - sliceProgress,
              }}
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
                {sliceProgress < 0.3 && <SliceFlash className="absolute inset-0 h-full w-full" />}
              </div>
            </div>
          );
        }

        return (
          <div
            key={obj.id}
            className="absolute"
            style={{
              left: `${obj.x * 100}%`,
              top: `${y * 100}%`,
              width: "13%",
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
            }}
          >
            <Icon className="h-full w-full drop-shadow" />
          </div>
        );
      })}

      {popups
        .filter((p) => p.laneIndex === laneIndex)
        .map((popup) => {
          const progress = Math.min(1, (now - popup.spawnedAt) / 750);
          return (
            <div
              key={popup.id}
              className="absolute select-none text-2xl font-extrabold lg:text-4xl"
              style={{
                left: `${popup.x * 100}%`,
                top: `${popup.y * 100 - progress * 22}%`,
                transform: "translate(-50%, -50%)",
                opacity: 1 - progress,
                color: popup.amount > 0 ? "#3ECF8E" : "#FF6B5B",
                textShadow: "0 2px 6px rgba(0,0,0,0.25)",
              }}
            >
              {popup.amount > 0 ? `+${popup.amount}` : popup.amount}
            </div>
          );
        })}
    </GameStage>
  );
}
