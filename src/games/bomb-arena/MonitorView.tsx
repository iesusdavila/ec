"use client";

import { memo } from "react";
import { GameStage } from "@/components/GameStage";
import type { GameMonitorProps } from "@/games/types";
import type { Player } from "@/core/types";
import {
  bomberPosition,
  GRID_H,
  GRID_W,
  type BombArenaState,
  type Cell,
  type PowerUp,
} from "@/games/bomb-arena/logic";

/**
 * La arena en el monitor.
 *
 * Todo se coloca en porcentajes sobre un tablero de 13×11 casillas. Los
 * jugadores usan su posición INTERPOLADA (`bomberPosition`), que es la que se
 * ve moverse suave; la casilla entera sigue siendo la que decide quién muere,
 * y coinciden siempre porque el movimiento va de centro a centro.
 */

const CELL_W = 100 / GRID_W;
const CELL_H = 100 / GRID_H;

const POWERUP_ICON: Record<PowerUp, string> = { bomb: "💣", fire: "🔥", speed: "👟" };
const POWERUP_LABEL: Record<PowerUp, string> = {
  bomb: "una bomba más",
  fire: "más alcance",
  speed: "más velocidad",
};

/**
 * La rejilla solo cambia cuando se rompe un bloque o cae uno de la muerte
 * súbita: unas pocas veces por partida, no sesenta veces por segundo. Se
 * memoiza contra una firma del contenido para no reconstruir 143 casillas en
 * cada cuadro mientras el resto de la escena sí se mueve.
 */
const Grid = memo(function Grid({ signature }: { signature: string }) {
  const cells = signature.split("") as ("e" | "w" | "b")[];
  return (
    <>
      {cells.map((cell, i) => {
        const cx = i % GRID_W;
        const cy = Math.floor(i / GRID_W);
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${cx * CELL_W}%`,
              top: `${cy * CELL_H}%`,
              width: `${CELL_W}%`,
              height: `${CELL_H}%`,
              background:
                cell === "w"
                  ? "linear-gradient(160deg, #4a4f5c, #2b2f38)"
                  : cell === "b"
                    ? "linear-gradient(160deg, #8a6440, #5f4429)"
                    : "transparent",
              borderRadius: cell === "e" ? 0 : "12%",
              boxShadow:
                cell === "w"
                  ? "inset 0 -0.5cqh 0 rgba(0,0,0,0.45), inset 0 0.4cqh 0 rgba(255,255,255,0.12)"
                  : cell === "b"
                    ? "inset 0 -0.5cqh 0 rgba(0,0,0,0.4), inset 0 0.4cqh 0 rgba(255,255,255,0.18)"
                    : "none",
            }}
          />
        );
      })}
    </>
  );
});

function cellSignature(grid: Cell[]): string {
  let out = "";
  for (const cell of grid) out += cell === "wall" ? "w" : cell === "brick" ? "b" : "e";
  return out;
}

/**
 * OJO: esta vista NO puede envolverse en `React.memo`, ni la firma de la
 * rejilla calcularse con `useMemo` sobre el estado.
 *
 * El motor muta su estado EN EL SITIO por rendimiento, así que `state` es
 * siempre el mismo objeto: `memo` lo daría por sin cambios y `useMemo` no
 * recalcularía nunca. El resultado era una arena congelada en el primer
 * fotograma mientras la partida seguía y hasta terminaba por dentro. La firma
 * se recalcula en cada render a propósito —son 143 caracteres— y es `Grid`,
 * que sí recibe un dato primitivo, quien se ahorra el trabajo de verdad.
 */
export function BombArenaMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const arena = state as BombArenaState | null;
  const signature = arena ? cellSignature(arena.grid) : "";

  if (!arena) {
    return <div className="flex flex-1 items-center justify-center text-muted">Montando la arena…</div>;
  }

  const byId = new Map<string, Player>(players.map((p) => [p.id, p]));
  const remaining = Math.max(0, Math.ceil((arena.durationMs - arena.elapsedMs) / 1000));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <GameStage
          aspectRatio={`${GRID_W} / ${GRID_H}`}
          className="max-h-full"
          style={{ containerType: "size", background: "#1b1f27" }}
        >
          {/* Suelo a cuadros: ayuda a contar casillas de un vistazo, que es
              exactamente lo que hay que hacer para calcular si te alcanza. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25% 75%, rgba(255,255,255,0.03) 75%)",
              backgroundSize: `${CELL_W * 2}% ${CELL_H * 2}%`,
            }}
          />

          <Grid signature={signature} />

          {arena.powerups.map((powerup) => (
            <div
              key={`${powerup.cx}-${powerup.cy}`}
              className="absolute flex items-center justify-center"
              style={{
                left: `${powerup.cx * CELL_W}%`,
                top: `${powerup.cy * CELL_H}%`,
                width: `${CELL_W}%`,
                height: `${CELL_H}%`,
                fontSize: "4cqh",
              }}
              title={POWERUP_LABEL[powerup.kind]}
            >
              <span
                className="flex h-[70%] w-[70%] items-center justify-center rounded-lg"
                style={{ background: "rgba(255,255,255,0.14)", border: "0.3cqh solid rgba(255,255,255,0.3)" }}
              >
                {POWERUP_ICON[powerup.kind]}
              </span>
            </div>
          ))}

          {arena.bombs.map((bomb) => {
            // Late más rápido cuanto menos queda: se lee el peligro sin contar.
            const left = Math.max(0, bomb.explodesAt - (arena.elapsedMs || 0));
            const urgency = 1 - Math.min(1, left / 2400);
            return (
              <div
                key={bomb.id}
                className="absolute flex items-center justify-center"
                style={{
                  left: `${bomb.cx * CELL_W}%`,
                  top: `${bomb.cy * CELL_H}%`,
                  width: `${CELL_W}%`,
                  height: `${CELL_H}%`,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: `${58 + urgency * 22}%`,
                    height: `${58 + urgency * 22}%`,
                    background: "radial-gradient(circle at 35% 30%, #4a4a52, #17171b)",
                    boxShadow: `0 0 ${1 + urgency * 3}cqh rgba(255,120,60,${0.3 + urgency * 0.6})`,
                    border: "0.3cqh solid rgba(255,180,120,0.5)",
                  }}
                />
              </div>
            );
          })}

          {arena.blasts.map((blast, i) => (
            <div
              key={`${blast.cx}-${blast.cy}-${i}`}
              className="absolute"
              style={{
                left: `${blast.cx * CELL_W}%`,
                top: `${blast.cy * CELL_H}%`,
                width: `${CELL_W}%`,
                height: `${CELL_H}%`,
                borderRadius: blast.center ? "50%" : "18%",
                background: blast.center
                  ? "radial-gradient(circle, #FFF3C4, #FF9A2E 55%, #FF4D00)"
                  : "radial-gradient(circle, #FFD27A, #FF7A1E 70%)",
                boxShadow: "0 0 2cqh rgba(255,150,60,0.85)",
              }}
            />
          ))}

          {arena.players.map((player) => {
            if (!player.alive) return null;
            const info = byId.get(player.id);
            const pos = bomberPosition(player);
            return (
              <div
                key={player.id}
                className="absolute"
                style={{
                  left: `${pos.x * CELL_W}%`,
                  top: `${pos.y * CELL_H}%`,
                  width: `${CELL_W}%`,
                  height: `${CELL_H}%`,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    width: "76%",
                    height: "76%",
                    borderRadius: "34% 34% 26% 26%",
                    background: info?.color ?? "#5B8CFF",
                    border: "0.35cqh solid rgba(0,0,0,0.45)",
                    boxShadow: `0 0 1.4cqh ${(info?.color ?? "#5B8CFF")}99`,
                  }}
                />
                <span
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[2cqh] font-semibold"
                  style={{
                    top: "-1.6cqh",
                    color: info?.color ?? "#fff",
                    textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  }}
                >
                  {info?.name}
                </span>
              </div>
            );
          })}

          {arena.suddenDeath && (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[2.6cqh] font-semibold text-red-300">
              ¡La arena se cierra!
            </div>
          )}
        </GameStage>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-4 px-3 text-sm lg:text-lg">
        <span className="font-mono tabular-nums text-muted">{remaining}s</span>
        {arena.players.map((player) => {
          const info = byId.get(player.id);
          return (
            <span
              key={player.id}
              className="flex items-center gap-2"
              style={{ opacity: player.alive ? 1 : 0.35 }}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: info?.color ?? "#888" }} />
              <span className="font-medium">{info?.name}</span>
              {player.alive ? (
                <span className="font-mono text-xs tabular-nums text-muted">
                  💣{player.maxBombs} 🔥{player.range}
                </span>
              ) : (
                <span className="text-xs text-muted">eliminado</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
