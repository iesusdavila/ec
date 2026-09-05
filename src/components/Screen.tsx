import type { ReactNode } from "react";

/** Contenedor de pantalla completa centrado, base de todas las vistas. */
export function Screen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`min-h-dvh w-full flex flex-col items-center justify-center gap-8 px-6 py-10 text-center ${className}`}
    >
      {children}
    </main>
  );
}
