import type { ReactElement } from "react";
import type { GameMonitorProps } from "@/games/types";
import type { Player } from "@/core/types";
import type {
  FruitLane,
  FruitSliceState,
  ObjectKind,
  PlayerCursor,
} from "@/games/fruit-slice/logic";
import {
  arcY,
  CURSOR_FX_MS,
  OBJECT_LIFETIME_MS,
  SLICE_LINGER_MS,
} from "@/games/fruit-slice/logic";
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

const SHAKE_MS = 400;
const TRAIL_MS = 220;

/**
 * Tamaños en `cqmin` (1% del lado menor del escenario). El escenario ahora
 * llena la pantalla, así que su forma varía mucho —muy apaisado con un solo
 * carril, estrecho y alto con pantalla dividida—. Medir en % del ancho haría
 * que los objetos fueran enormes en un carril ancho y diminutos en uno
 * estrecho; `cqmin` los mantiene coherentes en ambos casos.
 */
const OBJECT_SIZE = "16cqmin";
const CURSOR_CORE = "4.6cqmin";
const CURSOR_RING = "7.4cqmin";
const CURSOR_HALO = "26cqmin";

const ICONS: Record<ObjectKind, (props: { className?: string }) => ReactElement> = {
  apple: AppleIcon,
  watermelon: WatermelonIcon,
  orange: OrangeIcon,
  banana: BananaIcon,
  bomb: BombIcon,
};

/**
 * Latencia (ida) por encima de la cual el indicador avisa. El objetivo del
 * juego es responder en menos de 0,2 s de punta a punta; 120 ms de red dejan
 * margen para el muestreo y el pintado. Ver core/realtime/clockSync.ts.
 */
const LATENCY_OK_MS = 120;
const LATENCY_WARN_MS = 200;

function latencyColor(ms: number): string {
  if (ms <= LATENCY_OK_MS) return "#3ECF8E";
  if (ms <= LATENCY_WARN_MS) return "#F5C451";
  return "#FF6B5B";
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
  // Latencia real del teléfono más lento. Se muestra porque este juego se
  // juega o no se juega según ese número, y hasta ahora no había forma de
  // saberlo: si el puntero va raro, aquí se ve si es la red o es otra cosa.
  const worstLatency = cursorList.reduce((max, c) => Math.max(max, c.latencyMs), 0);
  // En modo compartido varios cursores conviven en el mismo carril: ahí sí hace
  // falta distinguirlos con un aro del color del jugador y su nombre.
  const sharedMode = !fruit.splitScreen && fruit.lanes.some((l) => l.playerIds.length > 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 lg:gap-3 lg:p-5">
      {/* Keyframes del fondo y del halo del cursor: se inyectan una sola vez. */}
      <style>{FRUIT_SLICE_CSS}</style>

      <div className="flex shrink-0 items-center justify-between">
        <p className="text-base font-semibold lg:text-xl">
          Apunta con el teléfono y barre para cortar · evita las bombas
        </p>
        <div className="flex items-center gap-4">
          {!fruit.splitScreen &&
            ranked.map(([id, score]) => (
              <span key={id} className="flex items-center gap-2 text-base lg:text-xl">
                <span
                  className="h-3 w-3 rounded-full lg:h-4 lg:w-4"
                  style={{ backgroundColor: colorFor(id) }}
                  aria-hidden
                />
                {nameFor(id)}: <span className="font-semibold">{score}</span>
              </span>
            ))}
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-xs tabular-nums lg:text-sm"
            style={{ color: latencyColor(worstLatency), borderColor: latencyColor(worstLatency) }}
            title="Latencia medida del teléfono al monitor"
          >
            {Math.round(worstLatency)} ms
          </span>
          <span className="font-mono text-2xl tabular-nums lg:text-4xl">
            {Math.ceil(fruit.remainingMs / 1000)}s
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {fruit.lanes.map((lane, laneIndex) => (
          <div key={laneIndex} className="flex min-h-0 flex-1 flex-col gap-1">
            {fruit.splitScreen && (
              <div className="flex shrink-0 items-center justify-center gap-2">
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
            <div className="min-h-0 flex-1">
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
          </div>
        ))}
      </div>
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
    <GameStage fill style={{ transform: `translateX(${offset}px)` }}>
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
        const y = arcY((age - obj.spawnedAt) / OBJECT_LIFETIME_MS);
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
                left: 0,
                top: 0,
                width: OBJECT_SIZE,
                aspectRatio: "1 / 1",
                transform: `translate3d(calc(${obj.x} * 100cqw - 50%), calc(${y} * 100cqh - 50%), 0)`,
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
              left: 0,
              top: 0,
              width: OBJECT_SIZE,
              aspectRatio: "1 / 1",
              // Igual que el cursor: `transform` en vez de `left`/`top` para
              // que el movimiento lo resuelva el compositor, no el layout.
              transform: `translate3d(calc(${obj.x} * 100cqw - 50%), calc(${y} * 100cqh - 50%), 0)`,
              willChange: "transform",
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
                left: 0,
                top: 0,
                transform: `translate3d(calc(${popup.x} * 100cqw - 50%), calc(${
                  popup.y - progress * 0.18
                } * 100cqh - 50%), 0)`,
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
 * para que en todo momento se vea a dónde apunta su teléfono. Deja una estela
 * cuando barre (que es lo que corta), un anillo verde al acertar y uno gris
 * al cortar al aire.
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
  const trail =
    cursor.trail && now - cursor.trail.at < TRAIL_MS
      ? { ...cursor.trail, t: (now - cursor.trail.at) / TRAIL_MS }
      : null;

  return (
    <>
      {/* Estela del barrido: la línea que efectivamente cortó. */}
      {trail && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ opacity: 1 - trail.t, zIndex: 5 }}
          aria-hidden
        >
          <line
            x1={trail.ax * 100}
            y1={trail.ay * 100}
            x2={trail.bx * 100}
            y2={trail.by * 100}
            stroke="#ffffff"
            strokeWidth="0.8"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 6px rgba(255,80,80,0.9))" }}
          />
        </svg>
      )}

      {/*
        Posicionado con `transform` en vez de `left`/`top`: el cursor se mueve
        en cada frame y animar `left`/`top` obliga al navegador a recalcular
        layout 60 veces por segundo, mientras que un `translate3d` lo resuelve
        el compositor en la GPU. Es la diferencia entre un puntero fluido y uno
        con micro-tirones. `cqw`/`cqh` son el ancho/alto del escenario (que
        declara `container-type: size`), así que la fracción 0..1 se convierte
        en píxeles sin tener que medir nada desde React. El div no tiene tamaño
        propio —sus hijos son absolutos—, así que actúa como un punto de anclaje.
      */}
      <div
        className="absolute"
        data-cursor={cursor.playerId}
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(calc(${cursor.x} * 100cqw), calc(${cursor.y} * 100cqh), 0)`,
          willChange: "transform",
          zIndex: 6,
        }}
      >
        {/* Halo de iluminación (late suavemente). */}
        <div
          className="fruitcursor-halo absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: CURSOR_HALO,
            height: CURSOR_HALO,
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
              width: `calc(${CURSOR_RING} + ${ringT * 14}cqmin)`,
              height: `calc(${CURSOR_RING} + ${ringT * 14}cqmin)`,
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
              width: CURSOR_RING,
              height: CURSOR_RING,
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
            width: CURSOR_CORE,
            height: CURSOR_CORE,
            transform: "translate(-50%, -50%)",
            backgroundColor: "#FF2E2E",
            border: "3px solid rgba(255,255,255,0.92)",
            boxShadow: "0 0 14px 5px rgba(255,45,45,0.85), 0 0 36px 14px rgba(255,45,45,0.45)",
          }}
        />

        {showLabel && name && (
          <div
            className="absolute left-1/2 whitespace-nowrap text-xs font-semibold lg:text-sm"
            style={{
              top: `calc(${CURSOR_RING} / 2 + 6px)`,
              transform: "translateX(-50%)",
              color,
              textShadow: "0 1px 4px rgba(0,0,0,0.85)",
            }}
          >
            {name}
          </div>
        )}
      </div>
    </>
  );
}
