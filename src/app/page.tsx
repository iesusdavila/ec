import Link from "next/link";
import { Screen } from "@/components/Screen";

export default function Home() {
  return (
    <Screen>
      <h1 className="text-3xl font-semibold tracking-tight">Juegos locales</h1>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/monitor"
          className="rounded-2xl bg-accent text-accent-foreground py-8 text-2xl font-semibold hover:opacity-90 transition-opacity"
        >
          MONITOR
        </Link>
        <Link
          href="/jugador"
          className="rounded-2xl bg-surface border border-border py-8 text-2xl font-semibold hover:bg-surface-strong transition-colors"
        >
          JUGADOR
        </Link>
      </div>
    </Screen>
  );
}
