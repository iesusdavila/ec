"use client";

import { useEffect, useRef, useState } from "react";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useSensorLifecycle, useSensorPermission } from "@/core/sensors/useSensors";
import { sensorService } from "@/core/sensors/SensorService";
import { positionTracking } from "@/core/sensors/tracking/positionTracking";

/**
 * Puerta de entrada de sensores para cualquier juego (sección 15/16):
 * siempre pide permiso primero y muestra un mensaje corto y claro si el
 * dispositivo no lo soporta o el usuario lo niega. Los juegos que usan
 * inclinación (`requireCalibration`) además dejan fijar la posición neutra
 * antes de empezar; los que solo detectan gestos (p. ej. agitar el
 * teléfono) continúan automáticamente en cuanto hay permiso.
 *
 * Los juegos con `requirePositionTracking` (Corta frutas) dan un paso más:
 * aquí se arranca el rastreo de posición de `core/sensors/tracking/`. Tiene que
 * ser AQUÍ y no en la vista del juego porque abrir la cámara —o una sesión
 * AR— exige un gesto del usuario, y este botón es el último que hay antes de
 * jugar. Si el rastreo no arranca, el juego sigue siendo jugable con la
 * inclinación de siempre; nunca se deja al jugador sin control.
 */
export function SensorGate({
  requireCalibration,
  requirePositionTracking = false,
  onDone,
}: {
  requireCalibration: boolean;
  requirePositionTracking?: boolean;
  onDone: () => void;
}) {
  const { state, request } = useSensorPermission();
  useSensorLifecycle(state === "granted");
  const autoContinuedRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  useEffect(() => {
    request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const needsScreen = requireCalibration || requirePositionTracking;
    if (state === "granted" && !needsScreen && !autoContinuedRef.current) {
      autoContinuedRef.current = true;
      onDone();
    }
  }, [state, requireCalibration, requirePositionTracking, onDone]);

  /** Fija el neutro de inclinación, que es el plan B si no hay rastreo. */
  function calibrateTilt() {
    sensorService.calibrate();
  }

  async function handleStartTracking() {
    setStarting(true);
    setTrackingError(null);
    calibrateTilt();
    const status = await positionTracking.enable();
    setStarting(false);
    if (status.state === "unavailable") {
      setTrackingError(status.reason);
      return;
    }
    positionTracking.recenter();
    onDone();
  }

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

  if (state !== "granted") {
    return <Screen>Solicitando acceso a sensores…</Screen>;
  }

  if (requirePositionTracking) {
    // El rastreo falló: se ofrece jugar con inclinación en vez de bloquear.
    // Es peor control, pero es jugable, y dejar al jugador fuera de la partida
    // porque la habitación está a oscuras sería mucho peor.
    if (trackingError) {
      return (
        <Screen>
          <h1 className="text-xl font-semibold">No se pudo seguir la posición</h1>
          <p className="text-muted max-w-xs">{trackingError}</p>
          <p className="text-muted max-w-xs text-sm">
            Puedes jugar apuntando con la inclinación del teléfono: sujétalo como vas a jugar y
            continúa.
          </p>
          <Button size="lg" onClick={handleStartTracking}>
            Reintentar con la cámara
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              calibrateTilt();
              onDone();
            }}
          >
            Jugar con inclinación
          </Button>
        </Screen>
      );
    }

    return (
      <Screen>
        <h1 className="text-xl font-semibold">Mueve el teléfono para apuntar</h1>
        <p className="text-muted max-w-xs">
          El cursor sigue al teléfono por el aire: llévalo arriba, abajo o a los lados y el punto
          irá contigo. Ponte de frente a la pantalla, sujeta el teléfono donde te resulte cómodo
          y pulsa comenzar: ese punto será el centro.
        </p>
        <p className="text-muted max-w-xs text-xs">
          Se usa la cámara trasera para medir el movimiento. Las imágenes se procesan en el
          teléfono y no se envían a ningún sitio.
        </p>
        <Button size="lg" disabled={starting} onClick={handleStartTracking}>
          {starting ? "Preparando…" : "Centrar y comenzar"}
        </Button>
      </Screen>
    );
  }

  if (!requireCalibration) {
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
          calibrateTilt();
          onDone();
        }}
      >
        Calibrar y comenzar
      </Button>
    </Screen>
  );
}
