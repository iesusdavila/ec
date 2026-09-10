"use client";

import { useEffect, useRef, useState } from "react";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useSensorLifecycle, useSensorPermission } from "@/core/sensors/useSensors";
import { positionTracking } from "@/core/sensors/tracking/positionTracking";
import type { PositionTrackingStatus } from "@/core/sensors/tracking/types";

/**
 * Depuración del rastreo de posición (`core/sensors/tracking/`).
 *
 * Sirve sobre todo para dos cosas que no se pueden hacer desde el escritorio:
 *
 *  - Ver QUÉ rastreador ha elegido este teléfono (ARCore o flujo óptico) sin
 *    tener que entrar a una partida.
 *  - Ajustar la sensibilidad. `AIM_HALF_RANGE` en `OpticalFlowTracker.ts`
 *    depende de la habitación —de lo lejos que esté aquello a lo que apunta la
 *    cámara trasera—, así que el número bueno se encuentra probando: mover el
 *    teléfono de un hombro al otro debería llevar el punto de borde a borde.
 */
export function PositionDebugClient() {
  const { state, request } = useSensorPermission();
  useSensorLifecycle(state === "granted");
  const [status, setStatus] = useState<PositionTrackingStatus>({ state: "idle" });

  const dotRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLPreElement>(null);

  // El bucle escribe en el DOM directamente, igual que el del juego: así esta
  // pantalla mide lo mismo que se va a jugar y no lo que pasa cuando React
  // rerenderiza 60 veces por segundo.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const sample = positionTracking.read();
      if (!sample) return;
      const dot = dotRef.current;
      if (dot) {
        dot.style.transform = `translate3d(calc(${0.5 + sample.x} * 100cqw - 50%), calc(${
          0.5 + sample.y
        } * 100cqh - 50%), 0)`;
      }
      const readout = readoutRef.current;
      if (readout) {
        readout.textContent =
          `x  ${sample.x.toFixed(3).padStart(7)}\n` +
          `y  ${sample.y.toFixed(3).padStart(7)}\n` +
          `conf ${sample.confidence.toFixed(2).padStart(5)}`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => positionTracking.disable(), []);

  // Solo en esta pantalla de depuración: deja el servicio al alcance de la
  // consola del navegador. Sirve para probarlo desde un teléfono conectado por
  // depuración remota, y para poder ejercitar la cadena completa
  // (cámara -> worker -> flujo) desde un script sin pasar por la interfaz.
  useEffect(() => {
    (window as unknown as { __positionTracking?: unknown }).__positionTracking =
      positionTracking;
  }, []);

  async function handleEnable() {
    setStatus({ state: "starting" });
    setStatus(await positionTracking.enable());
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Depuración de posición</h1>
      <p className="text-muted max-w-sm text-sm">
        Solo visible en desarrollo. Mueve el teléfono por el aire: el punto debe seguirlo. Girarlo
        sin moverlo no debería mover nada.
      </p>

      {state !== "granted" && (
        <Button onClick={request}>
          {state === "requesting" ? "Solicitando…" : "Solicitar permiso de sensores"}
        </Button>
      )}

      {state === "granted" && status.state !== "active" && (
        <Button onClick={handleEnable} disabled={status.state === "starting"}>
          {status.state === "starting" ? "Arrancando…" : "Activar rastreo de posición"}
        </Button>
      )}

      {status.state === "unavailable" && (
        <p className="max-w-sm text-sm text-danger" data-testid="tracking-error">
          {status.reason}
        </p>
      )}

      {status.state === "active" && (
        <p className="font-mono text-sm" data-testid="tracker-kind">
          rastreador: {status.kind}
        </p>
      )}

      <div
        className="relative w-full max-w-xs overflow-hidden rounded-2xl border-4 border-border bg-surface"
        style={{ aspectRatio: "16 / 10", containerType: "size" }}
      >
        <div
          ref={dotRef}
          className="absolute h-6 w-6 rounded-full bg-accent"
          style={{
            left: 0,
            top: 0,
            transform: "translate3d(calc(0.5 * 100cqw - 50%), calc(0.5 * 100cqh - 50%), 0)",
            willChange: "transform",
          }}
        />
      </div>

      <pre
        ref={readoutRef}
        data-testid="readout"
        className="font-mono text-sm tabular-nums text-muted"
      >
        —
      </pre>

      {status.state === "active" && (
        <Button variant="secondary" onClick={() => positionTracking.recenter()}>
          Recentrar
        </Button>
      )}
    </Screen>
  );
}
