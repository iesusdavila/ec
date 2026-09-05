import type { GameResult, Player } from "@/core/types";
import { Button } from "@/components/Button";

export function ResultScreen({
  result,
  players,
  onContinue,
}: {
  result: GameResult;
  players: Player[];
  onContinue: () => void;
}) {
  const nameFor = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  const winner = result.winnerId ? nameFor(result.winnerId) : null;

  return (
    <div className="flex flex-col items-center gap-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-muted">Resultado</p>
        <h1 className="text-4xl font-bold mt-2">
          {winner ? `${winner} gana` : "Partida terminada"}
        </h1>
      </div>

      <ol className="flex flex-col gap-2 w-full max-w-sm">
        {result.ranking.map((id, index) => (
          <li
            key={id}
            className="flex items-center justify-between rounded-xl bg-surface border border-border px-4 py-3"
          >
            <span className="font-medium">
              {index + 1}. {nameFor(id)}
            </span>
            <span className="tabular-nums text-muted">{result.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>

      <Button size="lg" onClick={onContinue}>
        Volver a selección de juego
      </Button>
    </div>
  );
}
