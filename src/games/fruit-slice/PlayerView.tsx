"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import { throttle } from "@/core/utils/throttle";
import type { FruitSliceInput } from "@/games/fruit-slice/logic";

/**
 * El teléfono funciona como un puntero tipo mouse:
 * - Inclinarlo mueve el cursor (el punto rojo del monitor).
 * - Barrer el cursor por encima de una fruta la corta.
 * - Tocar la pantalla corta en el punto exacto al que se apunta.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL ENVÍO VA LIMITADO A ~7 MENSAJES POR SEGUNDO
 *
 * Pusher limita los eventos de cliente a 10 por segundo y por conexión, y
 * descarta el resto en silencio (`trigger()` igual devuelve true). La primera
 * versión muestreaba y enviaba cada 50 ms: 20 mensajes/s mientras la mano se
 * movía, el doble del límite. Resultado en un teléfono real: las posiciones
 * llegaban a trompicones (el puntero "iba lentísimo") y, sobre todo, el
 * mensaje de corte se perdía casi siempre — el juego "no cortaba nada".
 *
 * Ahora: se muestrea rápido en local (el punto del teléfono se ve instantáneo)
 * pero solo se ENVÍA una posición cada AIM_SEND_MS, con envío de cola para que
 * la última posición siempre acabe llegando. Eso deja margen holgado por
 * debajo del límite para que los toques nunca se descarten. El monitor
 * interpola entre posiciones (ver CURSOR_EASE_TAU_MS en logic.ts), así que a
 * ~7/s el cursor igualmente se ve continuo.
 * ---------------------------------------------------------------------------
 */

// Grados de inclinación (respecto al punto calibrado) para llegar al borde.
const AIM_RANGE_DEG = 24;
// Muestreo local: solo mueve el punto de vista previa del teléfono.
const AIM_SAMPLE_MS = 32;
// Envío real por la red. ~7/s, con margen para los toques.
const AIM_SEND_MS = 140;
// Suavizado exponencial: 1 = crudo (nervioso), cerca de 0 = muy lento.
const AIM_SMOOTHING = 0.55;
// Desplazamiento mínimo para molestarse en enviar.
const AIM_MIN_DELTA = 0.004;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function FruitSlicePlayerView({ sendInput }: GamePlayerProps<FruitSliceInput>) {
  useSensorLifecycle(true);

  // `sendInput` se recrea en cada render del runtime; se guarda en un ref para
  // que el bucle de muestreo no tenga que recrearse con él (mismo patrón que
  // `useGesture`).
  const sendRef = useRef(sendInput);
  useEffect(() => {
    sendRef.current = sendInput;
  });

  // Posición filtrada del cursor y última enviada. En refs porque solo se tocan
  // dentro de un intervalo y de manejadores de eventos, nunca en render.
  const aimRef = useRef({ x: 0.5, y: 0.5 });
  const sentRef = useRef({ x: 0.5, y: 0.5 });
  const [preview, setPreview] = useState({ x: 0.5, y: 0.5 });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    // El limitador se crea dentro del efecto (no en render) para no capturar
    // un ref durante el renderizado: `react-hooks/refs` lo prohíbe y, de
    // hecho, hacerlo puede leer un valor obsoleto. Con deps [] la instancia
    // vive lo mismo que el componente. Envío de cola: la última posición
    // siempre acaba saliendo aunque la mano se pare entre dos ventanas.
    const sendAim = throttle((x: number, y: number) => {
      sendRef.current({ type: "aim", x, y });
    }, AIM_SEND_MS);

    const id = setInterval(() => {
      const { beta, gamma } = sensorService.getTilt();
      // gamma (giro izquierda/derecha) -> eje X.
      // beta (adelante/atrás) -> eje Y, con signo negativo: inclinar el borde
      // superior del teléfono hacia abajo baja el cursor, que es el gesto
      // natural de "apuntar más abajo".
      const targetX = clamp01(0.5 + gamma / AIM_RANGE_DEG / 2);
      const targetY = clamp01(0.5 - beta / AIM_RANGE_DEG / 2);

      const next = {
        x: aimRef.current.x + (targetX - aimRef.current.x) * AIM_SMOOTHING,
        y: aimRef.current.y + (targetY - aimRef.current.y) * AIM_SMOOTHING,
      };
      aimRef.current = next;
      // La vista previa local se refresca siempre: en el teléfono el punto
      // debe sentirse inmediato aunque el envío vaya limitado.
      setPreview(next);

      if (
        Math.abs(next.x - sentRef.current.x) > AIM_MIN_DELTA ||
        Math.abs(next.y - sentRef.current.y) > AIM_MIN_DELTA
      ) {
        sentRef.current = next;
        sendAim(next.x, next.y);
      }
    }, AIM_SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  function handleSlice(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const { x, y } = aimRef.current;
    // El corte lleva sus propias coordenadas y se envía sin limitar: es un
    // evento raro y nunca debe quedarse atrás del flujo de posiciones.
    sendRef.current({ type: "slice", x, y });
    setFlash(true);
    setTimeout(() => setFlash(false), 130);
    (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(18);
  }

  return (
    // Toda la pantalla es la zona de corte: en un teléfono, apuntar con una
    // mano y acertar un botón pequeño con la otra es innecesariamente difícil.
    <button
      type="button"
      aria-label="Cortar donde apunta el teléfono"
      onPointerDown={handleSlice}
      style={{ touchAction: "none" }}
      className="flex min-h-0 w-full flex-1 select-none flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="text-lg font-semibold">Apunta y barre para cortar</p>

      {/* Mini-réplica del escenario: muestra a dónde apunta el teléfono. */}
      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-2xl border-4 transition-colors ${
          flash ? "border-accent bg-accent/10" : "border-border bg-surface"
        }`}
        style={{ aspectRatio: "16 / 10" }}
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(127,127,127,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(127,127,127,0.35) 1px, transparent 1px)",
            backgroundSize: "25% 25%",
          }}
        />
        <span
          className="absolute h-6 w-6 rounded-full"
          style={{
            left: `${preview.x * 100}%`,
            top: `${preview.y * 100}%`,
            transform: "translate(-50%, -50%)",
            backgroundColor: "#FF2E2E",
            border: "2px solid rgba(255,255,255,0.9)",
            boxShadow: "0 0 0 4px rgba(255,46,46,0.22), 0 0 18px 6px rgba(255,46,46,0.45)",
          }}
        />
      </div>

      <p className="max-w-xs text-sm text-muted">
        Inclina el teléfono como un puntero láser. Pasa el punto rojo por encima
        de una fruta para cortarla, o toca la pantalla para cortar justo donde
        apunta.
      </p>
    </button>
  );
}
