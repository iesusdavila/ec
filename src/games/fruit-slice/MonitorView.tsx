import type { ReactElement } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { Player } from "@/core/types";
import type {
  FruitLane,
  FruitSliceState,
  ObjectKind,
  PlayerCursor,
} from "@/games/fruit-slice/logic";
import { CURSOR_FX_MS } from "@/games/fruit-slice/logic";
import { GameStage } from "@/components/GameStage";
import { FruitBackdrop, FRUIT_SLICE_CSS } from "@/games/fruit-slice/FruitBackdrop";
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
  const cursorList = Object.values(fruit.cursors);
  // En modo compartido varios cursores conviven en el mismo carril: ahí sí hace
  // falta distinguirlos con un aro del color del jugador y su nombre.
  const sharedMode = !fruit.splitScreen && fruit.lanes.some((l) => l.playerIds.length > 1);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6 lg:p-10">
      {/* Keyframes del fondo y del halo del cursor: se inyectan una sola vez. */}
      <style>{FRUIT_SLICE_CSS}</style>

      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold lg:text-2xl">
          Apunta con el teléfono y corta · evita las bombas
        </p>
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
              cursors={cursorList.filter((c) => c.laneIndex === laneIndex)}
              players={players}
              sharedMode={sharedMode}
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
  cursors,
  players,
  sharedMode,
}: {
  lane: FruitLane;
  laneIndex: number;
  now: number;
  popups: FruitSliceState["popups"];
  cursors: PlayerCursor[];
  players: Player[];
  sharedMode: boolean;
}) {
  const offset = shakeOffset(now, lane.lastBombAt);
  const exploding = lane.lastBombAt !== null && now - lane.lastBombAt < SHAKE_MS;

  return (
    <GameStage aspectRatio="4 / 3" className="flex-1" style={{ transform: `translateX(${offset}px)` }}>
      <FruitBackdrop />

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
              data-obj-kind={obj.kind}
              data-obj-sliced="true"
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

        const isBomb = obj.kind === "bomb";
        return (
          <div
            key={obj.id}
            className="absolute"
            data-obj-kind={obj.kind}
            data-obj-sliced="false"
            style={{
              left: `${obj.x * 100}%`,
              top: `${y * 100}%`,
              width: "13%",
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* Plato tenue: asienta el objeto sobre el fondo oscuro sin teñirlo. */}
            <div
              className="absolute rounded-full"
              style={{
                inset: "-16%",
                background: isBomb
                  ? "radial-gradient(circle, rgba(255,80,80,0.22) 0%, rgba(255,80,80,0) 68%)"
                  : "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                filter: isBomb
                  ? "drop-shadow(0 3px 7px rgba(0,0,0,0.65)) drop-shadow(0 0 6px rgba(255,90,90,0.55))"
                  : "drop-shadow(0 3px 7px rgba(0,0,0,0.6)) drop-shadow(0 0 2px rgba(255,255,255,0.55))",
              }}
            >
              <Icon className="h-full w-full" />
            </div>
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
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {popup.amount > 0 ? `+${popup.amount}` : popup.amount}
            </div>
          );
        })}

      {cursors.map((cursor) => (
        <FruitCursor
          key={cursor.playerId}
          cursor={cursor}
          now={now}
          color={players.find((p) => p.id === cursor.playerId)?.color ?? "#FF2E2E"}
          name={players.find((p) => p.id === cursor.playerId)?.name ?? ""}
          showLabel={sharedMode}
        />
      ))}
    </GameStage>
  );
}

/**
 * El puntero del jugador: un punto rojo grande con un halo de luz alrededor,
 * para que en todo momento se vea a dónde está apuntando su teléfono. Al
 * acertar un corte late un anillo verde; al cortar al aire, uno gris tenue.
 */
function FruitCursor({
  cursor,
  now,
  color,
  name,
  showLabel,
}: {
  cursor: PlayerCursor;
  now: number;
  color: string;
  name: string;
  showLabel: boolean;
}) {
  const hitT =
    cursor.lastHitAt !== null && now - cursor.lastHitAt < CURSOR_FX_MS
      ? (now - cursor.lastHitAt) / CURSOR_FX_MS
      : null;
  const missT =
    cursor.lastMissAt !== null && now - cursor.lastMissAt < CURSOR_FX_MS
      ? (now - cursor.lastMissAt) / CURSOR_FX_MS
      : null;
  const ringT = hitT ?? missT;

  return (
    <div
      className="absolute"
      style={{
        left: `${cursor.x * 100}%`,
        top: `${cursor.y * 100}%`,
        transform: "translate(-50%, -50%)",
        zIndex: 6,
      }}
    >
      {/* Halo de iluminación (late suavemente). */}
      <div
        className="fruitcursor-halo absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 150,
          height: 150,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(255,45,45,0.5) 0%, rgba(255,45,45,0.16) 42%, rgba(255,45,45,0) 72%)",
          animation: "fruitcursor-pulse 1.6s ease-in-out infinite",
        }}
      />

      {/* Anillo de acierto (verde) / fallo (gris). */}
      {ringT !== null && (
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 34 + ringT * 66,
            height: 34 + ringT * 66,
            transform: "translate(-50%, -50%)",
            border: `3px solid ${hitT !== null ? "#3ECF8E" : "rgba(255,255,255,0.55)"}`,
            opacity: 1 - ringT,
          }}
        />
      )}

      {/* Aro con el color del jugador (solo en modo compartido). */}
      {showLabel && (
        <div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 44,
            height: 44,
            transform: "translate(-50%, -50%)",
            border: `2px solid ${color}`,
            opacity: 0.9,
          }}
        />
      )}

      {/* Núcleo rojo. */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 28,
          height: 28,
          transform: "translate(-50%, -50%)",
          backgroundColor: "#FF2E2E",
          border: "3px solid rgba(255,255,255,0.92)",
          boxShadow:
            "0 0 14px 5px rgba(255,45,45,0.85), 0 0 36px 14px rgba(255,45,45,0.45)",
        }}
      />

      {showLabel && name && (
        <div
          className="absolute left-1/2 whitespace-nowrap text-xs font-semibold lg:text-sm"
          style={{
            top: 30,
            transform: "translateX(-50%)",
            color,
            textShadow: "0 1px 4px rgba(0,0,0,0.85)",
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
}
