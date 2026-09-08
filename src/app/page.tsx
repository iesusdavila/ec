import Link from "next/link";
import { Screen } from "@/components/Screen";

export default function Home() {
  return (
    <Screen>
      <h1 className="text-3xl font-semibold tracking-tight">Juegos locales</h1>
      {/* Los dos accesos usan el mismo sistema de botones que el resto de la
          app (ver globals.css). Antes se pintaban a mano aquí y eran los
          únicos botones sin relieve ni estado de pulsación. */}
      <div className="flex w-full max-w-xs flex-col gap-4">
        <Link href="/monitor" className="btn btn-primary rounded-2xl py-7 text-2xl font-semibold">
          MONITOR
        </Link>
        <Link href="/jugador" className="btn btn-secondary rounded-2xl py-7 text-2xl font-semibold">
          JUGADOR
        </Link>
      </div>
    </Screen>
  );
}
