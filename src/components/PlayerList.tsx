import type { Player } from "@/core/types";

export function PlayerList({
  players,
  maxPlayers,
}: {
  players: Player[];
  maxPlayers?: number;
}) {
  if (players.length === 0) {
    return <p className="text-muted text-lg">Esperando jugadores…</p>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {players.map((player) => (
        <div
          key={player.id}
          className="flex items-center gap-2 rounded-full bg-surface border border-border px-4 py-2"
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: player.color }}
            aria-hidden
          />
          <span className="font-medium">{player.name}</span>
        </div>
      ))}
      {maxPlayers ? (
        <div className="flex items-center rounded-full px-4 py-2 text-muted">
          {players.length} / {maxPlayers}
        </div>
      ) : null}
    </div>
  );
}
