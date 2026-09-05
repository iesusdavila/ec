export interface TiltData {
  /** Inclinación adelante/atrás en grados (-180 a 180). */
  beta: number;
  /** Inclinación izquierda/derecha en grados (-90 a 90). */
  gamma: number;
  /** Rotación respecto al norte en grados (0 a 360). */
  alpha: number;
}

export interface AccelerationVector {
  x: number;
  y: number;
  z: number;
}

export interface MotionGesture {
  /** Eje dominante del movimiento detectado. */
  direction: "up" | "down" | "left" | "right" | "forward";
  /** Magnitud aproximada del gesto (m/s^2 pico, sin unidad estricta). */
  intensity: number;
  timestamp: number;
}

export type SensorAvailability = "unknown" | "available" | "unavailable";

export type PermissionState =
  /** Aún no se sabe / no se ha pedido. */
  | "idle"
  /** El navegador la está preguntando al usuario. */
  | "requesting"
  /** Concedido explícitamente o no requiere solicitud (Android/desktop). */
  | "granted"
  /** El usuario la negó explícitamente. */
  | "denied"
  /** El dispositivo/navegador no soporta el sensor en absoluto. */
  | "unsupported";
