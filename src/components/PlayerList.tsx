import type { Player } from "@/core/types";

export function PlayerList({
  players,
  maxPlayers,
}: {
  players: Player[];
  maxPlayers?: number;
}) {
  if (players.length === 0) {
    return <p className="text-muted text-lg lg:text-2xl">Esperando jugadores…</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-3 lg:gap-4">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 rounded-full bg-surface border border-border px-4 py-2 lg:gap-3 lg:px-6 lg:py-3 lg:text-xl"
        >
          <span
            className="h-3 w-3 rounded-full lg:h-4 lg:w-4"
            style={{ backgroundColor: player.color }}
            aria-hidden
          />
          <span className="font-medium">{player.name}</span>
        </div>
      ))}
      {maxPlayers ? (
        <div className="flex items-center rounded-full px-4 py-2 text-muted lg:px-6 lg:py-3 lg:text-xl">
          {players.length} / {maxPlayers}
        </div>
      ) : null}
    </div>
  );
}
