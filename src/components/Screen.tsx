import type { ReactNode } from "react";

/**
 * Contenedor de pantalla completa centrado, base de todas las vistas.
 *
 * Usa `h-dvh` (no `min-h-dvh`) y `overflow-hidden`: la app se ve en un monitor
 * o en un teléfono sostenido en la mano, y en ninguno de los dos casos se
 * quiere hacer scroll para llegar a un botón. La altura es exactamente la de
 * la ventana y el contenido se reparte dentro.
 *
 * `scroll` permite que UNA zona interior se desplace si de verdad no cabe
 * (p. ej. la rejilla de juegos en una pantalla muy baja), sin que la página
 * entera se convierta en un documento con scroll.
 */
export function Screen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`h-dvh w-full flex flex-col items-center justify-center gap-4 overflow-hidden px-6 py-5 text-center lg:gap-6 ${className}`}
    >
      {children}
    </main>
  );
}
