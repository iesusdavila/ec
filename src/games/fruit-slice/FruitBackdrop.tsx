/**
 * Fondo del juego "Corta frutas": un cielo nocturno con mariposas en tonos
 * apagados (índigo, pizarra, ciruela).
 *
 * Es deliberadamente oscuro y de baja saturación por dos motivos que pidió el
 * usuario:
 * 1. El carril antes no tenía fondo (solo el gris de `GameStage`); costaba leer
 *    la escena.
 * 2. El fondo NO debe competir con los colores de los objetivos: las frutas son
 *    cálidas y saturadas (rojo, verde, naranja, amarillo) y la bomba es casi
 *    negra. Las mariposas van en fríos desaturados y translúcidos, así quedan
 *    como textura y nunca se confunden con algo que haya que cortar.
 *
 * Todas las animaciones son puramente CSS y viven en `FRUIT_SLICE_CSS`, que el
 * `MonitorView` inyecta una sola vez. Nada de esto toca al resto de juegos.
 */

interface Butterfly {
  left: number; // %
  top: number; // %
  size: number; // % del ancho del escenario
  color: string;
  opacity: number;
  duration: number; // s (deriva lenta)
  delay: number; // s
  drift: "a" | "b" | "c";
}

const BUTTERFLIES: Butterfly[] = [
  { left: 12, top: 20, size: 9, color: "#3b3168", opacity: 0.26, duration: 17, delay: 0, drift: "a" },
  { left: 79, top: 14, size: 6.5, color: "#25324f", opacity: 0.22, duration: 21, delay: 2.4, drift: "b" },
  { left: 47, top: 38, size: 11, color: "#2f2a45", opacity: 0.18, duration: 25, delay: 1, drift: "c" },
  { left: 23, top: 66, size: 8, color: "#1f3a4a", opacity: 0.24, duration: 19, delay: 3.6, drift: "b" },
  { left: 86, top: 58, size: 6, color: "#402f4d", opacity: 0.28, duration: 15, delay: 0.9, drift: "a" },
  { left: 61, top: 77, size: 9, color: "#2b3358", opacity: 0.2, duration: 23, delay: 4.1, drift: "c" },
  { left: 7, top: 45, size: 5.5, color: "#33324f", opacity: 0.24, duration: 18, delay: 1.7, drift: "b" },
];

/**
 * Keyframes compartidos por el fondo (deriva + aleteo) y por el cursor del
 * monitor (pulso del halo). Se exporta como string para inyectarlo una sola
 * vez desde `MonitorView` y no repetir un `<style>` por carril.
 */
export const FRUIT_SLICE_CSS = `
@keyframes fruitbf-drift-a { 0%,100% { transform: translate3d(0,0,0) rotate(-4deg); } 50% { transform: translate3d(6%, -9%, 0) rotate(5deg); } }
@keyframes fruitbf-drift-b { 0%,100% { transform: translate3d(0,0,0) rotate(3deg); } 50% { transform: translate3d(-7%, -6%, 0) rotate(-6deg); } }
@keyframes fruitbf-drift-c { 0%,100% { transform: translate3d(0,0,0) rotate(0deg); } 50% { transform: translate3d(4%, -11%, 0) rotate(8deg); } }
@keyframes fruitbf-flap { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.62); } }
@keyframes fruitcursor-pulse { 0%,100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; } 50% { transform: translate(-50%, -50%) scale(1.14); opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  .fruitbf-drift, .fruitbf-flap, .fruitcursor-halo { animation: none !important; }
}
`;

function ButterflyShape({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      {/* alas superiores */}
      <path d="M50 50 C 30 16, 2 20, 12 44 C 4 66, 34 80, 50 52 Z" fill={color} />
      <path d="M50 50 C 70 16, 98 20, 88 44 C 96 66, 66 80, 50 52 Z" fill={color} />
      {/* alas inferiores, un poco más tenues */}
      <path d="M50 50 C 40 60, 16 64, 22 80 C 30 94, 48 82, 50 60 Z" fill={color} opacity="0.75" />
      <path d="M50 50 C 60 60, 84 64, 78 80 C 70 94, 52 82, 50 60 Z" fill={color} opacity="0.75" />
      {/* cuerpo */}
      <rect x="48.6" y="34" width="2.8" height="34" rx="1.4" fill={color} />
    </svg>
  );
}

export function FruitBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        background:
          "radial-gradient(125% 90% at 50% 8%, rgba(42,42,74,0.45) 0%, rgba(12,12,22,1) 46%, rgba(6,6,12,1) 100%), #06060c",
      }}
      aria-hidden
    >
      {/* Motas de "estrellas" muy tenues para que el negro no sea plano. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(1.6px 1.6px at 18% 28%, rgba(255,255,255,0.14) 0, transparent 100%)," +
            "radial-gradient(1.4px 1.4px at 68% 18%, rgba(255,255,255,0.10) 0, transparent 100%)," +
            "radial-gradient(1.4px 1.4px at 38% 72%, rgba(255,255,255,0.08) 0, transparent 100%)," +
            "radial-gradient(1.6px 1.6px at 85% 66%, rgba(255,255,255,0.10) 0, transparent 100%)," +
            "radial-gradient(1.2px 1.2px at 54% 44%, rgba(255,255,255,0.07) 0, transparent 100%)",
        }}
      />

      {BUTTERFLIES.map((b, i) => (
        <div
          key={i}
          className="fruitbf-drift absolute"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: `${b.size}%`,
            aspectRatio: "1 / 1",
            opacity: b.opacity,
            filter: "blur(0.4px)",
            animation: `fruitbf-drift-${b.drift} ${b.duration}s ease-in-out ${b.delay}s infinite`,
          }}
        >
          <div
            className="fruitbf-flap h-full w-full"
            style={{
              transformOrigin: "50% 50%",
              animation: `fruitbf-flap ${1.5 + (i % 3) * 0.35}s ease-in-out ${b.delay}s infinite`,
            }}
          >
            <ButterflyShape color={b.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
