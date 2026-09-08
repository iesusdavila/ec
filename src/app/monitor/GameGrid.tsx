import type { GameDefinition } from "@/games/types";

/**
 * Cuadrícula de selección de juego.
 *
 * Las tarjetas son ~25% más pequeñas que antes. Lo importante: eso NO se
 * consigue solo bajando el `padding` y el tamaño del icono. Las columnas son
 * fracciones del contenedor, así que mientras el contenedor midiera lo mismo
 * las tarjetas seguirían ocupando el mismo ancho y solo se quedarían vacías por
 * dentro. Por eso el `max-w` baja en la misma proporción (48rem -> 36rem, y
 * 64rem -> 48rem en pantalla grande) que el resto de medidas.
 */
export function GameGrid({
  games,
  selectedId,
  playerCount,
  onSelect,
}: {
  games: GameDefinition[];
  selectedId: string | null;
  playerCount: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-3xl lg:gap-4">
      {games.map((game) => {
        const selected = game.id === selectedId;
        const inRange = playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelect(game.id)}
            aria-pressed={selected}
            className={`game-card flex flex-col items-center gap-2 rounded-2xl border p-4 text-left lg:gap-3 lg:p-5 ${
              selected
                ? "border-accent bg-surface-strong"
                : "border-border bg-surface hover:bg-surface-strong"
            }`}
          >
            <game.Thumbnail className="h-12 w-12 lg:h-18 lg:w-18" />
            <div>
              <p className="font-semibold lg:text-lg">{game.name}</p>
              <p className="text-xs text-muted lg:text-sm">{game.shortDescription}</p>
              <p className={`mt-1 text-xs ${inRange ? "text-emerald-500" : "text-muted"}`}>
                {game.minPlayers === game.maxPlayers
                  ? `${game.minPlayers} jugador(es)`
                  : `${game.minPlayers}–${game.maxPlayers} jugadores`}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
