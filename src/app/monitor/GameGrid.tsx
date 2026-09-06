import type { GameDefinition } from "@/games/types";

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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-3xl lg:max-w-5xl lg:gap-6">
      {games.map((game) => {
        const selected = game.id === selectedId;
        const inRange = playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
        return (
          <button
            key={game.id}
            onClick={() => onSelect(game.id)}
            className={`flex flex-col items-center gap-3 rounded-2xl border p-5 text-left transition-colors lg:gap-4 lg:p-7 ${
              selected
                ? "border-accent bg-surface-strong"
                : "border-border bg-surface hover:bg-surface-strong"
            }`}
          >
            <game.Thumbnail className="h-16 w-16 lg:h-24 lg:w-24" />
            <div>
              <p className="font-semibold lg:text-xl">{game.name}</p>
              <p className="text-sm text-muted lg:text-base">{game.shortDescription}</p>
              <p className={`mt-1 text-xs lg:text-sm ${inRange ? "text-emerald-500" : "text-muted"}`}>
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
