"use client";

import { useEffect, useRef } from "react";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useSensorLifecycle, useSensorPermission } from "@/core/sensors/useSensors";
import { sensorService } from "@/core/sensors/SensorService";

/**
 * Puerta de entrada de sensores para cualquier juego (sección 15/16):
 * siempre pide permiso primero y muestra un mensaje corto y claro si el
 * dispositivo no lo soporta o el usuario lo niega. Los juegos que usan
 * inclinación (`requireCalibration`) además dejan fijar la posición neutra
 * antes de empezar; los que solo detectan gestos (p. ej. agitar el
 * teléfono) continúan automáticamente en cuanto hay permiso.
 */
export function SensorGate({
  requireCalibration,
  onDone,
}: {
  requireCalibration: boolean;
  onDone: () => void;
}) {
  const { state, request } = useSensorPermission();
  useSensorLifecycle(state === "granted");
  const autoContinuedRef = useRef(false);

  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === "granted" && !requireCalibration && !autoContinuedRef.current) {
      autoContinuedRef.current = true;
      onDone();
    }
  }, [state, requireCalibration, onDone]);

  if (state === "unsupported") {
    return (
      <Screen>
        <h1 className="text-xl font-semibold">Sensores no disponibles</h1>
        <p className="text-muted max-w-xs">
          Tu navegador o dispositivo no soporta los sensores de movimiento que este juego
          necesita. Prueba con otro teléfono.
        </p>
      </Screen>
    );
  }

  if (state === "denied") {
    return (
      <Screen>
        <h1 className="text-xl font-semibold">Permiso de sensores denegado</h1>
        <p className="text-muted max-w-xs">
          Este juego necesita acceso al movimiento del teléfono. Habilítalo en los ajustes del
          navegador e inténtalo de nuevo.
        </p>
        <Button onClick={request}>Intentar de nuevo</Button>
      </Screen>
    );
  }

  if (state !== "granted" || !requireCalibration) {
    return <Screen>Solicitando acceso a sensores…</Screen>;
  }

  return (
    <Screen>
      <h1 className="text-xl font-semibold">Mantén el teléfono en posición cómoda</h1>
      <p className="text-muted max-w-xs">
        Sujeta el teléfono como jugarás y presiona calibrar para fijar el punto neutro.
      </p>
      <Button
        size="lg"
        onClick={() => {
          sensorService.calibrate();
          onDone();
        }}
      >
        Calibrar y comenzar
      </Button>
    </Screen>
  );
}
