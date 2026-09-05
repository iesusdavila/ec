"use client";

import { useEffect, useRef, useState } from "react";
import { sensorService } from "@/core/sensors/SensorService";
import type { MotionGesture, PermissionState, TiltData } from "@/core/sensors/types";

/**
 * Activa los listeners de sensores mientras el componente que la usa está
 * montado (típicamente, mientras un juego está en pantalla) y los libera al
 * desmontar. Esto evita que un juego termine y deje listeners de
 * acelerómetro corriendo en segundo plano (ver README sección 14/26).
 */
export function useSensorLifecycle(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const stop = sensorService.start();
    return () => stop();
  }, [active]);
}

export function useSensorPermission(): {
  state: PermissionState;
  request: () => Promise<void>;
} {
  const [state, setState] = useState<PermissionState>("idle");

  const request = async () => {
    setState("requesting");
    const result = await sensorService.requestPermission();
    setState(result);
  };

  return { state, request };
}

/**
 * Devuelve la inclinación actual muestreada a baja frecuencia, pensada para
 * feedback visual simple o la pantalla de depuración. La lógica de juego
 * en tiempo real debe llamar a sensorService.getTilt() directamente dentro
 * de su propio loop, no depender de este hook.
 */
export function useTiltSnapshot(active: boolean, sampleMs = 80): TiltData {
  const [tilt, setTilt] = useState<TiltData>({ beta: 0, gamma: 0, alpha: 0 });

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTilt(sensorService.getTilt()), sampleMs);
    return () => clearInterval(id);
  }, [active, sampleMs]);

  return tilt;
}

export function useGesture(active: boolean, onGesture: (gesture: MotionGesture) => void): void {
  const handlerRef = useRef(onGesture);
  useEffect(() => {
    handlerRef.current = onGesture;
  });

  useEffect(() => {
    if (!active) return;
    return sensorService.onGesture((gesture) => handlerRef.current(gesture));
  }, [active]);
}
