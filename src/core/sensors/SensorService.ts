import type {
  AccelerationVector,
  MotionGesture,
  PermissionState,
  TiltData,
} from "@/core/sensors/types";

type Unsubscribe = () => void;

interface DeviceOrientationEventConstructorWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

interface DeviceMotionEventConstructorWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const GESTURE_TRIGGER_THRESHOLD = 18; // m/s^2 por encima de la gravedad
const GESTURE_COOLDOWN_MS = 350;

/**
 * Capa reutilizable sobre las APIs web de sensores del teléfono
 * (deviceorientation / devicemotion). Ningún juego debe leer estos eventos
 * directamente: todos consumen esta interfaz simplificada
 * (getTilt, getAcceleration, onGesture, calibrate).
 *
 * Pensado como instancia única por pestaña de jugador. start()/stop() se
 * llaman desde el ciclo de vida del juego activo para no dejar listeners
 * huérfanos cuando el juego termina.
 */
export class SensorService {
  private tilt: TiltData = { beta: 0, gamma: 0, alpha: 0 };
  private calibrationOffset: { beta: number; gamma: number } = { beta: 0, gamma: 0 };
  private acceleration: AccelerationVector = { x: 0, y: 0, z: 0 };
  private lastGestureAt = 0;
  private listening = false;

  private gestureListeners = new Set<(gesture: MotionGesture) => void>();

  isOrientationSupported(): boolean {
    return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  }

  isMotionSupported(): boolean {
    return typeof window !== "undefined" && "DeviceMotionEvent" in window;
  }

  /**
   * En iOS 13+, orientación y movimiento requieren permiso explícito
   * disparado por un gesto del usuario (tap). En Android y escritorio no
   * existe tal API y se considera concedido automáticamente.
   */
  async requestPermission(): Promise<PermissionState> {
    if (!this.isOrientationSupported() && !this.isMotionSupported()) {
      return "unsupported";
    }

    const OrientationCtor = (typeof DeviceOrientationEvent !== "undefined"
      ? DeviceOrientationEvent
      : undefined) as unknown as DeviceOrientationEventConstructorWithPermission | undefined;
    const MotionCtor = (typeof DeviceMotionEvent !== "undefined"
      ? DeviceMotionEvent
      : undefined) as unknown as DeviceMotionEventConstructorWithPermission | undefined;

    const needsExplicitRequest =
      typeof OrientationCtor?.requestPermission === "function" ||
      typeof MotionCtor?.requestPermission === "function";

    if (!needsExplicitRequest) {
      return "granted";
    }

    try {
      const results = await Promise.all([
        OrientationCtor?.requestPermission?.() ?? Promise.resolve("granted" as const),
        MotionCtor?.requestPermission?.() ?? Promise.resolve("granted" as const),
      ]);
      return results.every((r) => r === "granted") ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  start(): Unsubscribe {
    if (typeof window === "undefined") return () => {};
    if (this.listening) return () => this.stop();
    this.listening = true;

    window.addEventListener("deviceorientation", this.handleOrientation);
    window.addEventListener("devicemotion", this.handleMotion);

    return () => this.stop();
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener("deviceorientation", this.handleOrientation);
    window.removeEventListener("devicemotion", this.handleMotion);
    this.gestureListeners.clear();
  }

  /** Toma la orientación actual como posición neutra ("cero"). */
  calibrate(): void {
    this.calibrationOffset = { beta: this.tilt.beta, gamma: this.tilt.gamma };
  }

  /** Inclinación relativa a la calibración, en grados. */
  getTilt(): TiltData {
    return {
      beta: this.tilt.beta - this.calibrationOffset.beta,
      gamma: this.tilt.gamma - this.calibrationOffset.gamma,
      alpha: this.tilt.alpha,
    };
  }

  getAcceleration(): AccelerationVector {
    return this.acceleration;
  }

  onGesture(listener: (gesture: MotionGesture) => void): Unsubscribe {
    this.gestureListeners.add(listener);
    return () => this.gestureListeners.delete(listener);
  }

  private handleOrientation = (event: DeviceOrientationEvent) => {
    this.tilt = {
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
      alpha: event.alpha ?? 0,
    };
  };

  private handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    this.acceleration = { x, y, z };

    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    if (magnitude > GESTURE_TRIGGER_THRESHOLD && now - this.lastGestureAt > GESTURE_COOLDOWN_MS) {
      this.lastGestureAt = now;
      const direction = this.dominantDirection(x, y, z);
      const gesture: MotionGesture = { direction, intensity: magnitude, timestamp: now };
      this.gestureListeners.forEach((listener) => listener(gesture));
    }
  };

  private dominantDirection(x: number, y: number, z: number): MotionGesture["direction"] {
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);

    if (absZ >= absX && absZ >= absY) return "forward";
    if (absX >= absY) return x > 0 ? "right" : "left";
    return y > 0 ? "up" : "down";
  }
}

/** Instancia única compartida por la pestaña de jugador. */
export const sensorService = new SensorService();
