"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import type { FruitSliceInput } from "@/games/fruit-slice/logic";

/**
 * El teléfono funciona como un puntero tipo mouse:
 * - Inclinarlo mueve un cursor (el punto rojo que se ve en el monitor).
 * - Un toque en la pantalla ejecuta el corte EN ese punto.
 *
 * ANTES este control agitaba el teléfono y mandaba un evento vacío; la lógica
 * cortaba "cualquier objeto vivo del carril", así que una bomba junto a una
 * fruta se cortaba sí o sí sin importar la puntería. Ahora solo se corta lo que
 * está bajo el cursor.
 *
 * El juego ahora se calibra al entrar (`needsCalibration`), así que la forma
 * natural de sostener el teléfono equivale al centro de la pantalla.
 */

// Grados de inclinación (respecto al punto calibrado) para llegar al borde.
const AIM_RANGE_DEG = 28;
// Cada cuánto se muestrea la inclinación y (si cambió) se envía al monitor.
const AIM_SAMPLE_MS = 50;
// Suavizado exponencial: 1 = crudo (nervioso), cerca de 0 = muy lento.
const AIM_SMOOTHING = 0.4;
// Desplazamiento mínimo para molestarse en enviar (cuida la cuota de Pusher).
const AIM_MIN_DELTA = 0.005;

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

      const moved =
        Math.abs(next.x - sentRef.current.x) > AIM_MIN_DELTA ||
        Math.abs(next.y - sentRef.current.y) > AIM_MIN_DELTA;
      if (moved) {
        sentRef.current = next;
        sendRef.current({ type: "aim", x: next.x, y: next.y });
        setPreview(next);
      }
    }, AIM_SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  function handleSlice(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    const { x, y } = aimRef.current;
    sendRef.current({ type: "slice", x, y });
    setFlash(true);
    setTimeout(() => setFlash(false), 130);
    (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(18);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-lg font-semibold">Inclina para apuntar · toca para cortar</p>

      <button
        type="button"
        aria-label="Cortar donde apunta el teléfono"
        onPointerDown={handleSlice}
        style={{ touchAction: "none" }}
        className={`relative w-full max-w-xs select-none overflow-hidden rounded-2xl border-4 transition-colors ${
          flash ? "border-accent bg-accent/10" : "border-border bg-surface"
        }`}
      >
        {/* Mini-réplica del escenario: muestra a dónde apunta el teléfono. */}
        <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
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
      </button>

      <p className="max-w-xs text-sm text-muted">
        Mueve el teléfono como un puntero láser: el punto rojo del monitor sigue
        tu mano. Toca aquí para cortar justo donde apunta.
      </p>
    </div>
  );
}
