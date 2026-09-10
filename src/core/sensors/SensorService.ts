import type {
  AccelerationVector,
  MotionGesture,
  PermissionState,
  TiltData,
  TiltSample,
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
  /** `performance.now()` del último evento de orientación recibido. */
  private tiltAt = 0;
  private calibrationOffset: { beta: number; gamma: number } = { beta: 0, gamma: 0 };
  private acceleration: AccelerationVector = { x: 0, y: 0, z: 0 };
  /**
   * Ángulo de giro ACUMULADO en radianes, integrado de `rotationRate`.
   *
   * Lo usa el rastreador de posición (`core/sensors/tracking/`) para descontar
   * de la imagen el desplazamiento que produce girar el teléfono. Se guarda
   * acumulado y no como velocidad angular a propósito: quien lo consume
   * necesita el giro EXACTO ocurrido entre dos frames de cámara, y restar dos
   * ángulos acumulados lo da sin depender de cuándo se muestreó. Muestrear la
   * velocidad instantánea en el momento del frame perdería los picos ocurridos
   * entre medias, que es justo cuando la mano gira rápido.
   *
   * La deriva del giroscopio no importa aquí: solo se usan DIFERENCIAS dentro
   * de una ventana de ~33 ms.
   */
  private rotation = { x: 0, y: 0, z: 0 };
  /** Gravedad aislada por paso bajo. Ver `getGravity()`. */
  private gravity: AccelerationVector = { x: 0, y: 0, z: 0 };
  private lastMotionAt = 0;
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

  /**
   * Igual que `getTilt()` pero indicando CUÁNDO se midió.
   *
   * Un bucle de juego a 60 fps y un sensor a ~60 Hz no van sincronizados: a
   * veces un frame lee un dato que ya leyó el anterior. Sin este dato, un
   * filtro no puede distinguir "la mano no se movió" de "todavía no ha llegado
   * la siguiente medición", y frena el puntero sin motivo. Con `at` puede
   * limitarse a predecir hasta que llegue una lectura de verdad.
   */
  getTiltSample(): TiltSample {
    const tilt = this.getTilt();
    return { ...tilt, at: this.tiltAt };
  }

  getAcceleration(): AccelerationVector {
    return this.acceleration;
  }

  /** Giro acumulado en radianes desde que arrancaron los sensores. */
  getRotationAngle(): AccelerationVector {
    return this.rotation;
  }

  /**
   * Vector de gravedad en los ejes del teléfono, aislado con un paso bajo.
   *
   * `accelerationIncludingGravity` mezcla gravedad y movimiento. La gravedad es
   * constante y el movimiento de un gesto es rápido y de media cero, así que un
   * paso bajo lento los separa bien. Filtrar importa justo cuando peor se
   * comporta la lectura cruda: durante un barrido, la aceleración del gesto
   * llega a varios m/s² y giraría el vector estimado varios grados.
   *
   * Lo usa el rastreador de posición para saber con qué ángulo sujeta el
   * jugador el teléfono y que "mover a la derecha" siga siendo horizontal
   * aunque lo lleve ladeado.
   */
  getGravity(): AccelerationVector {
    return this.gravity;
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
    this.tiltAt = performance.now();
  };

  private handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    this.acceleration = { x, y, z };
    // Paso bajo ~0,5 s de constante de tiempo a 60 Hz.
    const g = this.gravity;
    const k = g.x === 0 && g.y === 0 && g.z === 0 ? 1 : 0.03;
    this.gravity = {
      x: g.x + (x - g.x) * k,
      y: g.y + (y - g.y) * k,
      z: g.z + (z - g.z) * k,
    };

    this.integrateRotation(event);

    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    if (magnitude > GESTURE_TRIGGER_THRESHOLD && now - this.lastGestureAt > GESTURE_COOLDOWN_MS) {
      this.lastGestureAt = now;
      const direction = this.dominantDirection(x, y, z);
      const gesture: MotionGesture = { direction, intensity: magnitude, timestamp: now };
      this.gestureListeners.forEach((listener) => listener(gesture));
    }
  };

  /**
   * Integra `rotationRate` (grados/s) a un ángulo acumulado en radianes.
   *
   * `event.interval` es el periodo que declara el propio dispositivo y es más
   * fiable que medir el tiempo entre callbacks, que el navegador agrupa. Si no
   * viene, se recurre al reloj con un tope: un frame perdido no debe inyectar
   * un giro enorme e inventado.
   */
  private integrateRotation(event: DeviceMotionEvent): void {
    const rate = event.rotationRate;
    if (!rate) return;

    const now = performance.now();
    let dt = event.interval ? event.interval / 1000 : 0;
    if (!dt) {
      dt = this.lastMotionAt ? (now - this.lastMotionAt) / 1000 : 0;
    }
    this.lastMotionAt = now;
    if (dt <= 0 || dt > 0.2) return;

    const toRad = (Math.PI / 180) * dt;
    // beta gira sobre el eje X, gamma sobre el Y, alpha sobre el Z.
    this.rotation = {
      x: this.rotation.x + (rate.beta ?? 0) * toRad,
      y: this.rotation.y + (rate.gamma ?? 0) * toRad,
      z: this.rotation.z + (rate.alpha ?? 0) * toRad,
    };
  }

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
