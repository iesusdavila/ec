import type { CSSProperties, ReactNode } from "react";

/**
 * Escenario 2D compartido por los juegos que ya no usan <canvas>.
 *
 * Usar <canvas> resultó frágil en teléfonos reales: redimensionar el bitmap
 * en cada actualización de estado (hasta 60 veces por segundo) provocaba
 * pantallas en negro o congeladas en algunos GPUs móviles. Para el puñado
 * de objetos que maneja cada juego (frutas, un dardo, unos autos), posicionar
 * elementos SVG/DOM reales es igual de fluido y mucho más robusto.
 *
 * `aspectRatio` fija una relación de aspecto por CSS puro, así el tamaño del
 * escenario nunca depende de que un padre flex termine de calcular su alto
 * antes de que midamos nada.
 */
export function GameStage({
  children,
  aspectRatio = "4 / 3",
  className = "",
}: {
  children: ReactNode;
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full max-h-full overflow-hidden rounded-2xl bg-surface ${className}`}
      style={{ aspectRatio }}
    >
      {children}
    </div>
  );
}

/**
 * Posiciona a un hijo dentro del GameStage usando coordenadas de "mundo"
 * (0..worldWidth, 0..worldHeight), centrado en ese punto.
 */
export function StageObject({
  x,
  y,
  worldWidth,
  worldHeight,
  size,
  rotation = 0,
  style,
  children,
}: {
  x: number;
  y: number;
  worldWidth: number;
  worldHeight: number;
  /** Ancho del objeto como porcentaje del ancho del escenario (0-100). */
  size: number;
  rotation?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const leftPct = (x / worldWidth) * 100;
  const topPct = (y / worldHeight) * 100;
  return (
    <div
      className="absolute"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${size}%`,
        aspectRatio: "1 / 1",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
