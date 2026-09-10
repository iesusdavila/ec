"use client";


import { GameStage } from "@/components/GameStage";
import type { GameMonitorProps } from "@/games/types";
import type { Player } from "@/core/types";
import {
  PLATFORM_H,
  TOWER_PLAYER_H,
  TOWER_PLAYER_W,
  VIEW_H,
  WORLD_W,
  type Platform,
  type TowerPlayer,
  type TowerState,
} from "@/games/tower-climb/logic";

/**
 * La torre en el monitor.
 *
 * El mundo tiene 160 de ancho y sube sin techo; la ventana visible son 90 de
 * alto a partir de `cameraY`. Aquí solo se convierte eso a porcentajes: la Y
 * del mundo crece hacia ARRIBA y la de la pantalla hacia abajo, así que se
 * invierte al proyectar.
 *
 * Todo se posiciona con `transform`, que resuelve el compositor sin recalcular
 * layout; con hasta cuatro jugadores y treinta plataformas moviéndose a 60
 * cuadros por segundo, animar `top`/`left` obligaría al navegador a rehacer el
 * layout de la escena entera en cada cuadro.
 */

function toScreen(x: number, y: number, cameraY: number): { left: number; top: number } {
  return {
    left: (x / WORLD_W) * 100,
    top: (1 - (y - cameraY) / VIEW_H) * 100,
  };
}

const PLATFORM_STYLES: Record<Platform["kind"], { fill: string; border: string; label?: string }> = {
  solid: { fill: "var(--color-surface-strong)", border: "rgba(255,255,255,0.16)" },
  moving: { fill: "#3F5AA6", border: "rgba(160,190,255,0.5)" },
  crumble: { fill: "#8A5A2B", border: "rgba(255,190,120,0.45)" },
  spring: { fill: "#2E7D52", border: "rgba(120,255,180,0.55)" },
  ice: { fill: "#4E7C93", border: "rgba(190,235,255,0.6)" },
};

function PlatformView({ platform, cameraY }: { platform: Platform; cameraY: number }) {
  const style = PLATFORM_STYLES[platform.kind];
  const { left, top } = toScreen(platform.x, platform.y, cameraY);
  // Una plataforma que se está rompiendo parpadea; una rota se desvanece pero
  // se sigue dibujando tenue, para que se entienda que va a volver.
  const breaking = platform.kind === "crumble" && platform.breakAt != null && !platform.gone;
  const opacity = platform.gone ? 0.16 : breaking ? 0.75 : 1;

  return (
    <div
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${(platform.w / WORLD_W) * 100}%`,
        height: `${(PLATFORM_H / VIEW_H) * 100}%`,
        transform: "translateY(-100%)",
        borderRadius: "3cqh",
        background: style.fill,
        borderTop: `0.5cqh solid ${style.border}`,
        opacity,
        boxShadow: platform.gone ? "none" : "0 0.6cqh 1.2cqh rgba(0,0,0,0.35)",
        transition: "opacity 120ms linear",
      }}
    >
      {platform.kind === "spring" && (
        <div
          className="absolute left-1/2 h-full w-[18%] -translate-x-1/2"
          style={{
            background:
              "repeating-linear-gradient(90deg, rgba(180,255,210,0.9) 0 12%, transparent 12% 24%)",
          }}
        />
      )}
      {platform.kind === "ice" && (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))",
            borderRadius: "3cqh",
          }}
        />
      )}
      {platform.kind === "moving" && (
        <div className="absolute inset-0 flex items-center justify-center text-[2cqh] opacity-70">
          ↔
        </div>
      )}
    </div>
  );
}

function Climber({
  player,
  color,
  name,
  cameraY,
  elapsedMs,
}: {
  player: TowerPlayer;
  color: string;
  name: string;
  cameraY: number;
  elapsedMs: number;
}) {
  const { left, top } = toScreen(player.x, player.y, cameraY);
  const invulnerable = elapsedMs < player.invulnerableUntil;
  const hurt = elapsedMs - player.hurtAt < 350;
  const jumping = elapsedMs - player.jumpedAt < 220;

  return (
    <div
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${(TOWER_PLAYER_W / WORLD_W) * 100}%`,
        height: `${(TOWER_PLAYER_H / VIEW_H) * 100}%`,
        transform: "translate(-50%, -100%)",
        opacity: invulnerable ? 0.55 : 1,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: hurt ? "#FF4D4D" : color,
          borderRadius: "30% 30% 22% 22%",
          border: "0.4cqh solid rgba(0,0,0,0.35)",
          boxShadow: `0 0 1.4cqh ${color}88`,
          // Un guiño de estiramiento al despegar: cuesta nada y hace que el
          // salto se lea al instante desde el otro lado del salón.
          transform: jumping ? "scaleY(1.12) scaleX(0.92)" : "none",
          transformOrigin: "bottom center",
          transition: "transform 120ms ease-out",
        }}
      />
      {/* Ojos, mirando hacia donde se mueve. */}
      <div
        className="absolute flex gap-[18%]"
        style={{ top: "22%", left: player.facing === 1 ? "42%" : "18%" }}
      >
        <span className="block h-[1.1cqh] w-[1.1cqh] rounded-full bg-black/80" />
        <span className="block h-[1.1cqh] w-[1.1cqh] rounded-full bg-black/80" />
      </div>
      <span
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[1.7cqh] font-semibold"
        style={{ top: "-2.4cqh", color, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {name}
      </span>
    </div>
  );
}

/**
 * OJO: esta vista NO puede envolverse en `React.memo`.
 *
 * El motor muta su estado EN EL SITIO por rendimiento, así que la prop `state`
 * es siempre el mismo objeto y `memo` la daría por sin cambios: el juego seguía
 * simulándose por dentro y la pantalla se quedaba congelada en el primer
 * fotograma —reloj incluido—. Se detectó probando de punta a punta con
 * Playwright, no mirando el código.
 */
export function TowerClimbMonitorView({ state, players }: GameMonitorProps<unknown>) {
  const tower = state as TowerState | null;
  if (!tower) {
    return <div className="flex flex-1 items-center justify-center text-muted">Preparando la torre…</div>;
  }

  const byId = new Map<string, Player>(players.map((p) => [p.id, p]));
  const remaining = Math.max(0, Math.ceil((tower.durationMs - tower.elapsedMs) / 1000));
  const ordered = [...tower.players].sort(
    (a, b) => b.best - b.liftedByRespawn - (a.best - a.liftedByRespawn)
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
      <GameStage fill className="flex-1">
        {/* Cielo que se oscurece con la altura: da sensación de subir de verdad
            aunque la torre en sí sea siempre igual. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              hsl(230 45% ${Math.max(6, 16 - tower.cameraY / 90)}%),
              hsl(215 40% ${Math.max(10, 26 - tower.cameraY / 120)}%))`,
          }}
        />
        {/* Marcas de altura cada 50 unidades, para leer el progreso. */}
        {Array.from({ length: 4 }, (_, i) => {
          const mark = Math.ceil(tower.cameraY / 50) * 50 + i * 50;
          const top = (1 - (mark - tower.cameraY) / VIEW_H) * 100;
          if (top < 0 || top > 100) return null;
          return (
            <div
              key={mark}
              className="absolute left-0 w-full border-t border-dashed border-white/10 text-[1.6cqh] text-white/25"
              style={{ top: `${top}%` }}
            >
              <span className="ml-[0.6cqw]">{mark}</span>
            </div>
          );
        })}

        {tower.platforms.map((platform) => (
          <PlatformView key={platform.id} platform={platform} cameraY={tower.cameraY} />
        ))}

        {tower.players.map((player) =>
          player.out ? null : (
            <Climber
              key={player.id}
              player={player}
              color={byId.get(player.id)?.color ?? "#5B8CFF"}
              name={byId.get(player.id)?.name ?? ""}
              cameraY={tower.cameraY}
              elapsedMs={tower.elapsedMs}
            />
          )
        )}

        {/* Borde inferior: la línea de la que hay que mantenerse por encima. */}
        <div
          className="absolute bottom-0 left-0 h-[3cqh] w-full"
          style={{
            background: "linear-gradient(0deg, rgba(255,60,60,0.75), transparent)",
          }}
        />
      </GameStage>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-4 px-3 text-sm lg:text-lg">
        <span className="font-mono tabular-nums text-muted">{remaining}s</span>
        {ordered.map((player, index) => {
          const info = byId.get(player.id);
          const score = Math.max(0, Math.round(player.best - player.liftedByRespawn));
          return (
            <span
              key={player.id}
              className="flex items-center gap-2"
              style={{ opacity: player.out ? 0.4 : 1 }}
            >
              <span className="text-muted">{index + 1}.</span>
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: info?.color ?? "#888" }}
              />
              <span className="font-medium">{info?.name}</span>
              <span className="font-mono tabular-nums">{score}</span>
              <span className="text-xs" aria-label={`${player.lives} vidas`}>
                {player.out ? "✕" : "♥".repeat(player.lives)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
