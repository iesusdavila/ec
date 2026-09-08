"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GamePlayerProps } from "@/games/types";
import { sensorService } from "@/core/sensors/SensorService";
import { useSensorLifecycle } from "@/core/sensors/useSensors";
import { PointerKalmanFilter } from "@/core/sensors/KalmanFilter";
import { clientEventBudget } from "@/core/realtime/clientEventBudget";
import type { AimSample, FruitSliceInput } from "@/games/fruit-slice/logic";

/**
 * El teléfono funciona como un puntero tipo mouse:
 * - Inclinarlo mueve el cursor (el punto rojo del monitor).
 * - Barrer el cursor por encima de una fruta la corta.
 * - Tocar la pantalla corta en el punto exacto al que se apunta.
 *
 * ---------------------------------------------------------------------------
 * CÓMO SE CONSIGUE QUE RESPONDA EN MENOS DE 0,2 s
 *
 * Pusher solo deja mandar 10 mensajes por segundo y por conexión, así que la
 * frecuencia de envío no se puede subir. El retardo se ataca por las otras
 * cuatro vías, que juntas son la mayor parte del problema:
 *
 * 1. NO BLOQUEAR EL HILO PRINCIPAL DEL MÓVIL. Esta era la causa gorda del
 *    "tarda uno o dos segundos". La versión anterior hacía `setState` con la
 *    vista previa 31 veces por segundo, y encima el runtime hacía otro
 *    `setState` con cada snapshot del host (~14/s, con la posición de cada
 *    fruta dentro). Eso son ~45 renders de React por segundo en un teléfono:
 *    el hilo principal se satura, y como los envíos de Pusher salen POR ESE
 *    MISMO HILO, cada posición se quedaba esperando su turno detrás de un
 *    render. El puntero acumulaba retardo aunque la red fuera perfecta.
 *    Ahora el bucle no toca React: escribe el `transform` del punto de vista
 *    previa directamente en el DOM. Cero renders mientras se juega.
 *
 * 2. MANDAR LA TRAYECTORIA, NO UN PUNTO. El límite de Pusher es de mensajes,
 *    no de bytes: en el mismo mensaje caben todas las muestras del sensor desde
 *    el envío anterior, cada una fechada. El monitor ve el trazo real a 60 Hz
 *    en vez de una recta entre dos puntos separados 120 ms.
 *
 * 3. ENVIAR EN CUANTO HAY GESTO. No hay temporizador fijo: se envía en cuanto
 *    la mano se mueve y el presupuesto de Pusher lo permite. Al empezar un
 *    barrido el primer mensaje sale en el siguiente frame (~16 ms) en vez de
 *    esperar hasta 120 ms a que tocara. Cuando la mano está quieta no se gasta
 *    cuota, así que hay margen de sobra justo cuando hace falta.
 *
 * 4. FILTRAR CON KALMAN. Ver `core/sensors/KalmanFilter.ts`: da una posición
 *    estable con la mano quieta y sin retardo con la mano rápida, y de paso una
 *    velocidad limpia (no una resta de dos muestras ruidosas) que es lo que el
 *    monitor usa para extrapolar. Antes esa velocidad venía llena de picos y
 *    hacía saltar el cursor: el "se va muy loco".
 *
 * Y el toque de la pantalla ya no es un mensaje aparte que podía tirar Pusher:
 * viaja marcado dentro del lote, fechado, así que aunque el envío espere un
 * hueco de cuota el monitor sabe exactamente en qué instante se tocó.
 * ---------------------------------------------------------------------------
 */

// Grados de inclinación (respecto al punto calibrado) para llegar al borde.
const AIM_RANGE_DEG = 24;
/**
 * Movimiento (en fracciones de escenario) a partir del cual se encola una
 * muestra nueva. Por debajo es ruido y solo engordaría el mensaje.
 */
const SAMPLE_MIN_DELTA = 0.0015;
/** Aunque no se mueva, una muestra cada tanto mantiene vivo el puntero. */
const IDLE_SAMPLE_MS = 80;
/**
 * Movimiento acumulado desde el último envío que hace que valga la pena
 * mandar ya. Es deliberadamente pequeño: quien reparte de verdad los envíos es
 * `clientEventBudget`, esto solo decide que hay algo que contar.
 */
const FLUSH_MOVE_DELTA = 0.008;
/** Envío de fondo con la mano quieta: mantiene fresca la medida de latencia. */
const IDLE_FLUSH_MS = 350;
/** Muestras por lote. A 60 Hz y ~9 envíos/s salen ~7; el resto es margen. */
const MAX_SAMPLES_PER_BATCH = 16;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Margen fuera del escenario que se le permite al filtro (ver el bucle). */
const STAGE_MARGIN = 0.08;

function clampToStage(v: number): number {
  return Math.max(-STAGE_MARGIN, Math.min(1 + STAGE_MARGIN, v));
}

/** Recorta decimales para que el lote ocupe poco. 0,001 ≈ 2 px en 1920. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function FruitSlicePlayerView({ sendInput }: GamePlayerProps<FruitSliceInput>) {
  useSensorLifecycle(true);

  // `sendInput` ya es estable (ver GameRuntimePlayer), pero se guarda en un ref
  // para que el bucle nunca dependa de la identidad de una prop.
  const sendRef = useRef(sendInput);
  useEffect(() => {
    sendRef.current = sendInput;
  });

  const dotRef = useRef<HTMLSpanElement>(null);
  /** Lo rellena el efecto; lo llama el `onPointerDown` del botón. */
  const tapRef = useRef<() => void>(() => {});
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    // Todo el estado del bucle vive aquí como variables locales: no se lee ni
    // se escribe durante el render, así que no hace falta que sean refs.
    const filter = new PointerKalmanFilter();
    let pending: AimSample[] = [];
    let pendingHasCut = false;
    let aimX = 0.5;
    let aimY = 0.5;
    let velX = 0;
    let velY = 0;
    let lastStepAt = performance.now();
    /** Momento de la última muestra encolada (o del último envío). */
    let lastSampleAt = lastStepAt;
    let lastFlushAt = lastStepAt;
    /** Marca del último dato del sensor ya consumido, para no repetirlo. */
    let lastSensorAt = -1;
    /** Posición de la última muestra encolada, para no encolar duplicados. */
    let lastSampleX = 0.5;
    let lastSampleY = 0.5;
    /** Última posición que llegó a salir por la red. */
    let sentX = 0.5;
    let sentY = 0.5;
    let raf = 0;

    const pushSample = (now: number, cut: boolean) => {
      if (pending.length >= MAX_SAMPLES_PER_BATCH) {
        // Solo puede pasar si la cuota lleva un buen rato bloqueada. Se tira la
        // muestra más antigua, no la más nueva: lo viejo ya no sirve.
        pending.shift();
      }
      const sample: AimSample = {
        x: round3(aimX),
        y: round3(aimY),
        dt: Math.max(1, Math.round(now - lastSampleAt)),
      };
      if (cut) {
        sample.cut = 1;
        pendingHasCut = true;
      }
      pending.push(sample);
      lastSampleAt = now;
    };

    /**
     * Envía el lote si Pusher tiene hueco. Si no lo tiene, NO se pierde nada:
     * las muestras se quedan encoladas con su `dt`, así que cuando salgan el
     * monitor seguirá sabiendo en qué instante ocurrió cada una y evaluará el
     * corte contra lo que el jugador veía entonces.
     */
    const flush = (now: number): boolean => {
      if (pending.length === 0) return false;
      if (!clientEventBudget.canStream()) return false;

      clientEventBudget.noteStream();
      const batch = pending;
      pending = [];
      pendingHasCut = false;
      lastFlushAt = now;
      sentX = batch[batch.length - 1].x;
      sentY = batch[batch.length - 1].y;
      sendRef.current({ type: "aim", s: batch, vx: round3(velX), vy: round3(velY) });
      return true;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);

      const dtS = (now - lastStepAt) / 1000;
      lastStepAt = now;

      // Solo se corrige el filtro cuando el sensor ha dado un dato NUEVO. Si se
      // corrigiera con la lectura repetida de un frame sin evento, el filtro
      // entendería "la mano se paró" y frenaría el puntero sin motivo.
      const tilt = sensorService.getTiltSample();
      const fresh = tilt.at !== lastSensorAt;
      if (fresh) lastSensorAt = tilt.at;

      // gamma (giro izquierda/derecha) -> eje X.
      // beta (adelante/atrás) -> eje Y, con signo negativo: inclinar el borde
      // superior del teléfono hacia abajo baja el cursor, que es el gesto
      // natural de "apuntar más abajo".
      //
      // Se recorta a un poco MÁS que el escenario, no exactamente a 0..1. Los
      // dos extremos serían peores: recortar justo a 0..1 aplana la velocidad
      // estimada al llegar al borde (el cursor se frena antes de tiempo), y no
      // recortar nada deja que el estado interno del filtro se vaya a 1,5 si el
      // teléfono se inclina de más — y al volver hay que recorrer ese medio
      // escenario fantasma antes de que el puntero se mueva. El margen da
      // velocidad correcta en el borde y acota esa "cuerda" a un par de grados.
      const measurement = fresh
        ? {
            x: clampToStage(0.5 + tilt.gamma / AIM_RANGE_DEG / 2),
            y: clampToStage(0.5 - tilt.beta / AIM_RANGE_DEG / 2),
          }
        : null;

      const filtered = filter.step(measurement, dtS);
      aimX = clamp01(filtered.x);
      aimY = clamp01(filtered.y);
      velX = filtered.vx;
      velY = filtered.vy;

      // Vista previa local, escrita directamente en el DOM. Sin React de por
      // medio y con `transform`, que resuelve el compositor sin recalcular
      // layout (`cqw`/`cqh` son el tamaño del marco, ver más abajo).
      const dot = dotRef.current;
      if (dot) {
        dot.style.transform = `translate3d(calc(${aimX} * 100cqw - 50%), calc(${aimY} * 100cqh - 50%), 0)`;
      }

      const movedSinceSample = Math.hypot(aimX - lastSampleX, aimY - lastSampleY);
      if (movedSinceSample > SAMPLE_MIN_DELTA || now - lastSampleAt >= IDLE_SAMPLE_MS) {
        lastSampleX = aimX;
        lastSampleY = aimY;
        pushSample(now, false);
      }

      const movedSinceSent = Math.hypot(aimX - sentX, aimY - sentY);
      const shouldFlush =
        pendingHasCut ||
        movedSinceSent > FLUSH_MOVE_DELTA ||
        now - lastFlushAt >= IDLE_FLUSH_MS;
      if (shouldFlush) flush(now);
    };

    tapRef.current = () => {
      const now = performance.now();
      lastSampleX = aimX;
      lastSampleY = aimY;
      pushSample(now, true);
      flush(now);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      tapRef.current = () => {};
    };
  }, []);

  function handleSlice(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    tapRef.current();
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

      {/* Mini-réplica del escenario: muestra a dónde apunta el teléfono.
          `containerType: size` es lo que hace que `100cqw`/`100cqh` dentro
          signifiquen el ancho/alto de este marco, para poder posicionar el
          punto con un `transform` desde el bucle sin medir nada. */}
      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-2xl border-4 transition-colors ${
          flash ? "border-accent bg-accent/10" : "border-border bg-surface"
        }`}
        style={{ aspectRatio: "16 / 10", containerType: "size" }}
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
          ref={dotRef}
          className="absolute h-6 w-6 rounded-full"
          style={{
            left: 0,
            top: 0,
            transform: "translate3d(calc(0.5 * 100cqw - 50%), calc(0.5 * 100cqh - 50%), 0)",
            willChange: "transform",
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
