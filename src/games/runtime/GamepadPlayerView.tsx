"use client";

import { useEffect, useRef, useState } from "react";
import { clientEventBudget } from "@/core/realtime/clientEventBudget";
import type { PadInput } from "@/games/runtime/padInput";

/**
 * El teléfono convertido en mando, y en nada más.
 *
 * No muestra el juego, ni el marcador, ni la posición de nadie: para eso está
 * el monitor. Lo único que aparece además de los botones es un aviso cuando el
 * jugador está eliminado, porque si no la única señal sería que los botones
 * dejan de hacer efecto y eso se lee como que la app se colgó.
 *
 * ---------------------------------------------------------------------------
 * LATENCIA Y CUOTA
 *
 * Un mando tiene que sentirse inmediato, y hay dos retardos distintos:
 *
 *  - El que ve el jugador en su mano. Se resuelve en local: el botón se
 *    ilumina y el teléfono vibra en el mismo evento de `pointerdown`, sin
 *    esperar a nadie. Es lo que hace que el mando "se sienta" bien aunque el
 *    monitor vaya unas decenas de ms por detrás.
 *  - El de la red. Se envía en cuanto hay un cambio y `clientEventBudget` da
 *    permiso, no con un temporizador fijo; con la mano quieta no se gasta
 *    cuota, así que casi siempre hay hueco justo cuando se pulsa algo. En el
 *    peor caso (aporreando botones) el reparto de cuota añade ~100 ms, y
 *    aun así no se pierde ningún toque: ver `padInput.ts`.
 *
 * Y un latido lento de fondo: si un mensaje se pierde con un botón mantenido,
 * el motor se quedaría creyendo que sigue pulsado. Reafirmar el estado cada
 * poco lo corrige sin depender de que el jugador suelte.
 * ---------------------------------------------------------------------------
 */

/** Reafirmación del estado del mando aunque no cambie nada. */
const HEARTBEAT_MS = 500;
/** Cada cuánto se revisa si toca enviar. Quien reparte de verdad es la cuota. */
const FLUSH_CHECK_MS = 16;

export interface PadButtonSpec {
  id: string;
  /** Lo que se ve en el botón: una flecha, una palabra corta. */
  label: string;
  /** Etiqueta accesible, por si `label` es un símbolo. */
  aria: string;
}

export interface GamepadPlayerViewProps {
  sendInput: (input: PadInput) => void;
  /** Botones direccionales, a la izquierda. */
  dpad: "horizontal" | "four";
  /** Botones de acción, a la derecha. Uno o dos. */
  actions: PadButtonSpec[];
  /** Se muestra en vez del mando cuando el jugador ya no juega. */
  eliminated?: { title: string; detail?: string } | null;
}

const DIR_LEFT: PadButtonSpec = { id: "left", label: "◀", aria: "Izquierda" };
const DIR_RIGHT: PadButtonSpec = { id: "right", label: "▶", aria: "Derecha" };
const DIR_UP: PadButtonSpec = { id: "up", label: "▲", aria: "Arriba" };
const DIR_DOWN: PadButtonSpec = { id: "down", label: "▼", aria: "Abajo" };

export function GamepadPlayerView({
  sendInput,
  dpad,
  actions,
  eliminated = null,
}: GamepadPlayerViewProps) {
  const sendRef = useRef(sendInput);
  useEffect(() => {
    sendRef.current = sendInput;
  });

  /** Punteros que mantienen cada botón. Un botón puede tener varios dedos. */
  const pointersRef = useRef<Map<string, Set<number>>>(new Map());
  const heldRef = useRef<Set<string>>(new Set());
  const pressedRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef(false);
  /** Copia para pintar. Solo cambia al pulsar o soltar, no en cada frame. */
  const [visualHeld, setVisualHeld] = useState<string[]>([]);

  useEffect(() => {
    let lastSentAt = 0;
    let lastSentHeld = "";

    const flush = (now: number) => {
      const hasPresses = pressedRef.current.size > 0;
      if (!dirtyRef.current && !hasPresses && now - lastSentAt < HEARTBEAT_MS) return;
      if (!clientEventBudget.canStream(now)) return;

      const held = Array.from(heldRef.current);
      const pressed = Array.from(pressedRef.current);
      const heldKey = held.join(",");
      // Sin cambios y sin toques: solo se reafirma el estado de vez en cuando.
      if (!hasPresses && heldKey === lastSentHeld && now - lastSentAt < HEARTBEAT_MS) {
        dirtyRef.current = false;
        return;
      }

      pressedRef.current.clear();
      dirtyRef.current = false;
      lastSentAt = now;
      lastSentHeld = heldKey;
      clientEventBudget.noteStream(now);
      sendRef.current({ h: held, p: pressed });
    };

    const timer = setInterval(() => flush(Date.now()), FLUSH_CHECK_MS);
    return () => clearInterval(timer);
  }, []);

  // Soltar SIEMPRE se escucha en la ventana, no en el botón.
  //
  // Si el `pointerup` se atendiera solo en el botón, arrastrar el dedo fuera
  // antes de levantarlo dejaría el botón pulsado para siempre: el personaje
  // se quedaría corriendo solo contra una pared. Con el listener global, el
  // dedo puede levantarse donde sea.
  useEffect(() => {
    const release = (event: PointerEvent) => {
      let changed = false;
      for (const [id, pointers] of pointersRef.current) {
        if (pointers.delete(event.pointerId) && pointers.size === 0) {
          heldRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) {
        dirtyRef.current = true;
        setVisualHeld(Array.from(heldRef.current));
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  function press(id: string, event: React.PointerEvent) {
    event.preventDefault();
    let pointers = pointersRef.current.get(id);
    if (!pointers) {
      pointers = new Set();
      pointersRef.current.set(id, pointers);
    }
    if (pointers.has(event.pointerId)) return;
    pointers.add(event.pointerId);

    heldRef.current.add(id);
    pressedRef.current.add(id);
    dirtyRef.current = true;
    setVisualHeld(Array.from(heldRef.current));
    (navigator as Navigator & { vibrate?: (p: number) => void }).vibrate?.(12);
  }

  if (eliminated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-2xl font-semibold">{eliminated.title}</p>
        {eliminated.detail && <p className="text-muted">{eliminated.detail}</p>}
      </div>
    );
  }

  const directions =
    dpad === "horizontal" ? [DIR_LEFT, DIR_RIGHT] : [DIR_UP, DIR_LEFT, DIR_RIGHT, DIR_DOWN];

  return (
    <div
      className="flex min-h-0 w-full flex-1 select-none items-end justify-between gap-3 px-4 pb-6"
      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {dpad === "horizontal" ? (
        <div className="flex flex-1 gap-3">
          {directions.map((button) => (
            <PadButton
              key={button.id}
              spec={button}
              held={visualHeld.includes(button.id)}
              onPress={press}
              className="h-32 flex-1"
            />
          ))}
        </div>
      ) : (
        // Cruceta en rejilla 3×3: arriba centrado, izquierda y derecha a los
        // lados, abajo centrado. El hueco del medio se deja vacío a propósito
        // para que el pulgar note dónde está el centro sin mirar.
        <div className="grid w-44 shrink-0 grid-cols-3 grid-rows-3 gap-2">
          <div />
          <PadButton spec={DIR_UP} held={visualHeld.includes("up")} onPress={press} className="h-14" />
          <div />
          <PadButton spec={DIR_LEFT} held={visualHeld.includes("left")} onPress={press} className="h-14" />
          <div />
          <PadButton spec={DIR_RIGHT} held={visualHeld.includes("right")} onPress={press} className="h-14" />
          <div />
          <PadButton spec={DIR_DOWN} held={visualHeld.includes("down")} onPress={press} className="h-14" />
          <div />
        </div>
      )}

      <div className={`flex gap-3 ${dpad === "horizontal" ? "" : "flex-1 justify-end"}`}>
        {actions.map((button) => (
          <PadButton
            key={button.id}
            spec={button}
            held={visualHeld.includes(button.id)}
            onPress={press}
            accent
            className={dpad === "horizontal" ? "h-32 w-32" : "h-28 w-28"}
          />
        ))}
      </div>
    </div>
  );
}

function PadButton({
  spec,
  held,
  onPress,
  className = "",
  accent = false,
}: {
  spec: PadButtonSpec;
  held: boolean;
  onPress: (id: string, event: React.PointerEvent) => void;
  className?: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={spec.aria}
      aria-pressed={held}
      onPointerDown={(event) => onPress(spec.id, event)}
      onContextMenu={(event) => event.preventDefault()}
      style={{ touchAction: "none" }}
      className={`flex items-center justify-center rounded-2xl border-2 text-2xl font-bold transition-colors ${
        held
          ? accent
            ? "border-accent bg-accent text-accent-foreground"
            : "border-accent bg-accent/30"
          : "border-border bg-surface"
      } ${className}`}
    >
      {spec.label}
    </button>
  );
}
