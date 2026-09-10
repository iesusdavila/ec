import type { PositionSample, PositionTracker } from "@/core/sensors/tracking/types";

/**
 * Rastreo de posición delegado en ARCore a través de WebXR.
 *
 * Cuando está disponible es claramente mejor que el flujo óptico propio: ARCore
 * hace odometría visual-inercial de verdad (sigue puntos característicos de la
 * escena y los fusiona con la IMU), así que da posición métrica con deriva de
 * centímetros en vez de un desplazamiento relativo.
 *
 * A cambio tiene dos peajes que no se pueden esquivar:
 *
 *  1. La posición 6DoF SOLO existe dentro de una sesión `immersive-ar`. No hay
 *     forma de pedirle la pose a la página normal; está así en el estándar.
 *     Por eso hace falta `dom-overlay`, que deja la interfaz del juego encima
 *     de la vista de cámara.
 *  2. Solo Android. Safari en iPhone no implementa WebXR, así que allí
 *     `createPositionTracker` cae al flujo óptico.
 *
 * Requiere HTTPS y un gesto del usuario para arrancar la sesión.
 */

/**
 * Metros desde el centro hasta el borde del escenario. A diferencia del flujo
 * óptico, aquí SÍ hay escala real, así que esto es una distancia de verdad:
 * 30 cm a cada lado, un gesto de hombro cómodo.
 */
const XR_HALF_RANGE_M = 0.3;

const CLAMP = 0.5 + 0.08;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export class XrPoseTracker implements PositionTracker {
  readonly kind = "xr" as const;

  private session: XRSession | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private gl: WebGLRenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private frameHandle = 0;

  /** Posición y ejes fijados en el último `recenter()`. */
  private origin: Vec3 | null = null;
  private right: Vec3 = { x: 1, y: 0, z: 0 };
  private pendingRecenter = true;

  private sample: PositionSample = { x: 0, y: 0, at: 0, confidence: 0 };

  async start(): Promise<void> {
    if (this.session) return;
    const xr = navigator.xr;
    if (!xr) throw new Error("Este dispositivo no soporta WebXR.");

    // La sesión necesita un contexto WebGL aunque no dibujemos nada: es el
    // contrato de WebXR, que compone la capa de la aplicación sobre la cámara.
    // Aquí se deja el buffer en blanco y toda la interfaz la pone `dom-overlay`.
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { xrCompatible: true, alpha: true });
    if (!gl) throw new Error("No hay WebGL disponible para la sesión AR.");
    this.canvas = canvas;
    this.gl = gl;

    const session = await xr.requestSession("immersive-ar", {
      requiredFeatures: ["local"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.body },
    });
    this.session = session;

    await gl.makeXRCompatible();
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    this.refSpace = await session.requestReferenceSpace("local");

    session.addEventListener("end", () => {
      this.session = null;
      this.refSpace = null;
    });

    this.pendingRecenter = true;
    this.frameHandle = session.requestAnimationFrame(this.onFrame);
  }

  stop(): void {
    const session = this.session;
    this.session = null;
    this.refSpace = null;
    if (session) {
      if (this.frameHandle) session.cancelAnimationFrame(this.frameHandle);
      void session.end().catch(() => {});
    }
    this.frameHandle = 0;
    this.canvas = null;
    this.gl = null;
  }

  isAlive(): boolean {
    return this.session !== null;
  }

  recenter(): void {
    // No se puede fijar el origen aquí: la pose solo está disponible dentro del
    // callback de frame. Se apunta y se resuelve en el siguiente.
    this.pendingRecenter = true;
  }

  read(): PositionSample {
    return this.sample;
  }

  private onFrame = (time: number, frame: XRFrame) => {
    const session = this.session;
    const refSpace = this.refSpace;
    if (!session || !refSpace) return;
    this.frameHandle = session.requestAnimationFrame(this.onFrame);

    const pose = frame.getViewerPose(refSpace);
    if (!pose) {
      // ARCore ha perdido el seguimiento (poca luz, movimiento brusco). Se
      // mantiene la última posición y se baja la confianza; el consumidor sabe
      // que no debe extrapolar a ciegas.
      this.sample = { ...this.sample, at: performance.now(), confidence: 0 };
      return;
    }

    const p = pose.transform.position;
    const position: Vec3 = { x: p.x, y: p.y, z: p.z };

    if (this.pendingRecenter || !this.origin) {
      this.pendingRecenter = false;
      this.origin = position;
      this.right = horizontalRight(pose.transform.orientation);
      this.sample = { x: 0, y: 0, at: performance.now(), confidence: 1 };
      return;
    }

    const dx = position.x - this.origin.x;
    const dy = position.y - this.origin.y;
    const dz = position.z - this.origin.z;

    // Se proyecta sobre los ejes fijados al recentrar, no sobre los ejes del
    // mundo. El eje X del mundo apunta a donde mirase el teléfono al arrancar
    // la sesión, que no tiene por qué ser hacia la tele; con esto, "derecha" es
    // la derecha del jugador tal como estaba plantado al empezar. La altura sí
    // es directamente el eje Y, que en WebXR ya está alineado con la gravedad.
    const alongRight = dx * this.right.x + dz * this.right.z;

    this.sample = {
      x: clamp((alongRight * 0.5) / XR_HALF_RANGE_M, CLAMP),
      // +Y del mundo es arriba; +y de pantalla es abajo.
      y: clamp((-dy * 0.5) / XR_HALF_RANGE_M, CLAMP),
      at: time,
      confidence: 1,
    };
  };
}

/**
 * Vector "derecha del jugador" a partir de la orientación del teléfono,
 * aplanado a la horizontal.
 *
 * Aplanarlo importa: si el jugador sujeta el teléfono cabeceado (que es lo
 * normal, apuntando algo hacia abajo), el eje derecha crudo saldría inclinado y
 * un movimiento horizontal se leería en parte como vertical.
 */
function horizontalRight(q: DOMPointReadOnly): Vec3 {
  // La cámara mira por −Z, así que ese es el "adelante".
  const forward = rotateByQuaternion(q, { x: 0, y: 0, z: -1 });
  const len = Math.hypot(forward.x, forward.z);
  if (len < 1e-4) return { x: 1, y: 0, z: 0 };
  const fx = forward.x / len;
  const fz = forward.z / len;
  // derecha = adelante × arriba, con arriba = (0, 1, 0).
  return { x: -fz, y: 0, z: fx };
}

function rotateByQuaternion(q: DOMPointReadOnly, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** ¿Tiene este teléfono ARCore y WebXR AR disponible? */
export async function isXrTrackingSupported(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.xr) return false;
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}
