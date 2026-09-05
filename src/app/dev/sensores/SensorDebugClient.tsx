"use client";

import { useState } from "react";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import {
  useGesture,
  useSensorLifecycle,
  useSensorPermission,
  useTiltSnapshot,
} from "@/core/sensors/useSensors";
import { sensorService } from "@/core/sensors/SensorService";
import type { MotionGesture } from "@/core/sensors/types";

export function SensorDebugClient() {
  const { state, request } = useSensorPermission();
  const active = state === "granted";
  useSensorLifecycle(active);
  const tilt = useTiltSnapshot(active, 60);
  const [lastGesture, setLastGesture] = useState<MotionGesture | null>(null);
  useGesture(active, setLastGesture);

  const clampedX = Math.max(-45, Math.min(45, tilt.gamma));
  const clampedY = Math.max(-45, Math.min(45, tilt.beta));

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Depuración de sensores</h1>
      <p className="text-muted text-sm max-w-sm">
        Solo visible en desarrollo. Sirve para validar lecturas de orientación, aceleración y
        gestos antes de conectarlas a un juego.
      </p>

      {state !== "granted" && (
        <Button onClick={request}>
          {state === "requesting" ? "Solicitando…" : "Solicitar permiso de sensores"}
        </Button>
      )}

      {state === "granted" && (
        <>
          <div className="relative h-40 w-40 rounded-full border border-border bg-surface">
            <div
              className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{
                left: `${50 + (clampedX / 45) * 45}%`,
                top: `${50 + (clampedY / 45) * 45}%`,
              }}
            />
          </div>

          <dl className="grid grid-cols-3 gap-4 font-mono text-sm tabular-nums">
            <div>
              <dt className="text-muted">beta</dt>
              <dd>{tilt.beta.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-muted">gamma</dt>
              <dd>{tilt.gamma.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-muted">alpha</dt>
              <dd>{tilt.alpha.toFixed(1)}</dd>
            </div>
          </dl>

          <Button variant="secondary" onClick={() => sensorService.calibrate()}>
            Calibrar (fijar como cero)
          </Button>

          <div className="text-sm">
            <p className="text-muted">Último gesto detectado</p>
            <p className="font-mono">
              {lastGesture
                ? `${lastGesture.direction} · ${lastGesture.intensity.toFixed(1)}`
                : "—"}
            </p>
          </div>
        </>
      )}
    </Screen>
  );
}
