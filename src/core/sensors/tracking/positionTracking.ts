"use client";

import {
  OpticalFlowTracker,
  isOpticalFlowSupported,
} from "@/core/sensors/tracking/OpticalFlowTracker";
import { XrPoseTracker, isXrTrackingSupported } from "@/core/sensors/tracking/XrPoseTracker";
import type {
  PositionSample,
  PositionTracker,
  PositionTrackingStatus,
} from "@/core/sensors/tracking/types";

/**
 * Instancia única del rastreo de posición, en el mismo espíritu que
 * `sensorService`: los juegos no construyen rastreadores ni tocan la cámara,
 * solo piden `enable()` y leen `read()`.
 *
 * Vive fuera del ciclo de vida de React a propósito. Arranca en la pantalla de
 * calibración (que es donde hay un gesto del usuario, imprescindible para el
 * permiso de cámara y para abrir una sesión AR) y tiene que seguir vivo cuando
 * esa pantalla se desmonta y aparece la del juego.
 */
class PositionTrackingService {
  private tracker: PositionTracker | null = null;
  private status: PositionTrackingStatus = { state: "idle" };
  private starting: Promise<PositionTrackingStatus> | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  getStatus(): PositionTrackingStatus {
    // Si el rastreador se cayó solo (el jugador salió de la sesión AR), el
    // estado tiene que reflejarlo para que el juego vuelva al modo inclinación.
    if (this.tracker && !this.tracker.isAlive()) {
      this.tracker = null;
      this.status = { state: "unavailable", reason: "El seguimiento se interrumpió." };
    }
    return this.status;
  }

  /**
   * Arranca el mejor rastreador disponible. DEBE llamarse dentro de un gesto
   * del usuario.
   *
   * El orden es deliberado: ARCore primero porque su seguimiento es bastante
   * mejor, y flujo óptico como red de seguridad universal. Si ARCore está
   * anunciado pero la sesión falla —no está instalado "Servicios de Google Play
   * para RA", el usuario cancela el diálogo—, se cae al flujo óptico en vez de
   * dejar al jugador sin control.
   */
  async enable(): Promise<PositionTrackingStatus> {
    if (this.status.state === "active") return this.status;
    if (this.starting) return this.starting;

    this.retain();
    this.status = { state: "starting" };
    this.starting = this.startBest().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startBest(): Promise<PositionTrackingStatus> {
    if (await isXrTrackingSupported()) {
      const xr = new XrPoseTracker();
      try {
        await xr.start();
        this.tracker = xr;
        this.status = { state: "active", kind: "xr" };
        return this.status;
      } catch {
        xr.stop();
      }
    }

    if (isOpticalFlowSupported()) {
      const flow = new OpticalFlowTracker();
      try {
        await flow.start();
        this.tracker = flow;
        this.status = { state: "active", kind: "optical-flow" };
        return this.status;
      } catch (error) {
        flow.stop();
        this.status = {
          state: "unavailable",
          reason:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Hace falta permiso de cámara para seguir la posición del teléfono."
              : "No se pudo abrir la cámara trasera.",
        };
        return this.status;
      }
    }

    this.status = {
      state: "unavailable",
      reason: "Este teléfono no puede seguir su posición en el espacio.",
    };
    return this.status;
  }

  /**
   * Marca que alguien está usando el rastreo, cancelando una liberación
   * pendiente. Ver `release()`.
   */
  retain(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
  }

  /**
   * Suelta el rastreo, pero con un margen de gracia antes de apagar la cámara.
   *
   * El margen no es paranoia: en desarrollo, el modo estricto de React monta,
   * desmonta y vuelve a montar cada componente, así que un `disable()` directo
   * en la limpieza del efecto apagaría la cámara justo después de encenderla y
   * el juego caería al modo inclinación en cada recarga. También cubre el
   * cambio de una ronda a otra sin pedir el permiso de nuevo.
   */
  release(graceMs = 1200): void {
    this.retain();
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.disable();
    }, graceMs);
  }

  disable(): void {
    this.retain();
    this.tracker?.stop();
    this.tracker = null;
    this.status = { state: "idle" };
  }

  /** Fija la posición actual como centro de la pantalla. */
  recenter(): void {
    this.tracker?.recenter();
  }

  /** `null` si no hay rastreo: el juego debe usar la inclinación. */
  read(): PositionSample | null {
    const tracker = this.tracker;
    if (!tracker || !tracker.isAlive()) return null;
    return tracker.read();
  }
}

export const positionTracking = new PositionTrackingService();
