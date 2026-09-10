import { sensorService } from "@/core/sensors/SensorService";
import type { PositionSample, PositionTracker } from "@/core/sensors/tracking/types";

/**
 * Rastreo de posición calculado por nosotros con la cámara trasera.
 *
 * Es la implementación universal: no necesita ARCore ni sesión AR, funciona
 * también en iPhone y deja la pantalla del teléfono libre para la interfaz del
 * juego. El trabajo pesado (comparar imágenes) vive en `flowWorker.ts`; aquí
 * queda la parte que necesita el DOM y los sensores: abrir la cámara, bombear
 * frames al worker y convertir su salida en una posición de pantalla.
 *
 * Ver `types.ts` para por qué esto no se puede hacer con el acelerómetro.
 */

/**
 * MANDO PRINCIPAL DE SENSIBILIDAD.
 *
 * El worker devuelve `traslación / profundidad` (una razón, no metros: con una
 * sola cámara la escala real es inobservable). Este valor dice qué razón
 * equivale a MEDIO escenario.
 *
 * Para traducirlo: en un salón donde la cámara trasera enfoca la pared de
 * enfrente a ~2,5 m, 0,113 × 2,5 ≈ 28 cm de movimiento real para ir del centro
 * al borde — un gesto de hombro cómodo, que es lo que se buscaba.
 *
 * Estaba en 0,13 y se bajó un 15% tras probarlo en un teléfono real: el
 * recorrido pedía demasiado brazo.
 *
 * Si el juego se siente lento, BAJA este número; si el cursor se dispara, súbelo.
 * Depende de la habitación: cuanto más lejos esté aquello a lo que apunta la
 * cámara, más movimiento real hace falta para el mismo recorrido en pantalla.
 */
const AIM_HALF_RANGE = 0.113;

/**
 * Recorte del acumulador, EXACTAMENTE en el borde del escenario.
 *
 * Recortar aquí, y no solo al dibujar, es lo que evita el efecto "cuerda": sin
 * recorte, seguir moviendo el teléfono más allá del borde llevaría el
 * acumulador a 2,0, y al volver habría que deshacer todo ese recorrido fantasma
 * antes de que el cursor se moviera.
 *
 * Estuvo en 0,58 —medio escenario más un margen del 8%— y el margen se quitó
 * porque se notaba: eran unos 4 cm de movimiento del teléfono, ya fuera del
 * borde, en los que el punto no reaccionaba al volver. El comportamiento
 * pedido es literal: pasado el borde no se mueve nada, y en cuanto vuelves se
 * mueve otra vez, sin zona muerta.
 */
const CLAMP = 0.5;

/** Por debajo de esto, la medida del worker no es de fiar. */
const MIN_CONFIDENCE = 0.25;
/**
 * Si el seguimiento se pierde más tiempo que esto, se empieza a publicar la
 * última posición buena CON marca de tiempo nueva.
 *
 * Es deliberado y hace falta: el filtro de la vista del jugador extrapola
 * mientras no llegan medidas, así que un apagón largo (cámara tapada, pared
 * lisa) mandaría el cursor volando fuera de la pantalla. Publicar la posición
 * retenida lo frena en seco donde estaba.
 */
const HOLD_AFTER_LOST_MS = 250;

/** Resolución que se le pide a la cámara. Al worker le llega aún más pequeño. */
const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;

/**
 * Cuánto se espera a la PRIMERA respuesta del worker antes de darlo por muerto.
 *
 * Sin esta comprobación existía un fallo silencioso feo: si el worker no
 * llegara a cargar —un fallo de empaquetado, por ejemplo—, construir el
 * `Worker` no lanza ninguna excepción, así que el rastreador se declararía
 * "activo" y se quedaría mudo para siempre. El jugador vería el cursor clavado
 * en el centro, sin control y SIN caer al modo inclinación, porque nadie se
 * habría enterado de que algo falló. Esperar la primera respuesta convierte eso
 * en un error normal, que `SensorGate` ya sabe explicar y del que se puede
 * salir jugando con la inclinación.
 *
 * Los primeros fotogramas devuelven confianza 0 (no hay anterior con el que
 * comparar), y da igual: lo que se comprueba es que el worker CONTESTA.
 */
const WORKER_HANDSHAKE_MS = 4000;

interface FlowMessage {
  type: "flow";
  at: number;
  tx: number;
  ty: number;
  confidence: number;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class OpticalFlowTracker implements PositionTracker {
  readonly kind = "optical-flow" as const;

  private stream: MediaStream | null = null;
  private video: VideoWithFrameCallback | null = null;
  private worker: Worker | null = null;
  private frameHandle = 0;
  private rafHandle = 0;
  private running = false;
  /** El worker se cayó o nunca llegó a arrancar: ver WORKER_HANDSHAKE_MS. */
  private failed = false;
  /** Solo un frame en vuelo: si el worker se retrasa, se tiran los nuevos. */
  private busy = false;
  private onFirstFlow: (() => void) | null = null;

  private accumX = 0;
  private accumY = 0;
  private sample: PositionSample = { x: 0, y: 0, at: 0, confidence: 0 };
  private lastGoodAt = 0;

  async start(): Promise<void> {
    if (this.running) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no da acceso a la cámara.");
    }

    // `environment` es la cámara trasera: la que ve la habitación. La frontal
    // vería sobre todo la cara del jugador, que se mueve CON el teléfono y por
    // tanto no informa de su desplazamiento.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: CAPTURE_WIDTH },
        height: { ideal: CAPTURE_HEIGHT },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    const video = document.createElement("video") as VideoWithFrameCallback;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    // Algunos navegadores pausan un vídeo que no está en el documento, así que
    // se adjunta invisible en vez de dejarlo suelto.
    video.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;";
    document.body.appendChild(video);
    this.video = video;

    await video.play();

    this.worker = new Worker(new URL("./flowWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FlowMessage>) => this.onFlow(event.data);
    this.worker.onerror = () => {
      this.failed = true;
    };

    this.running = true;
    this.recenter();
    this.pump();

    await this.waitForWorker();
  }

  /** Espera a que el worker dé señales de vida. Ver WORKER_HANDSHAKE_MS. */
  private waitForWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onFirstFlow = null;
        this.failed = true;
        reject(new Error("El análisis de imagen no respondió."));
      }, WORKER_HANDSHAKE_MS);

      this.onFirstFlow = () => {
        clearTimeout(timer);
        this.onFirstFlow = null;
        resolve();
      };
    });
  }

  stop(): void {
    this.running = false;
    this.onFirstFlow = null;
    if (this.video) {
      if (this.frameHandle && this.video.cancelVideoFrameCallback) {
        this.video.cancelVideoFrameCallback(this.frameHandle);
      }
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
    this.frameHandle = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.worker?.terminate();
    this.worker = null;
  }

  isAlive(): boolean {
    return this.running && !this.failed;
  }

  recenter(): void {
    this.accumX = 0;
    this.accumY = 0;
    const now = performance.now();
    this.sample = { x: 0, y: 0, at: now, confidence: 1 };
    // Hay que sellar la hora AQUÍ, y no dejarlo en cero.
    //
    // Dejándolo en cero, la guarda `lastGoodAt > 0` de `read()` nunca se
    // cumplía, así que si no llegaba ni una sola medida buena el rastreador
    // seguía devolviendo para siempre esta muestra: posición 0,0 y confianza 1.
    // O sea, afirmando con total seguridad que el teléfono estaba en el centro
    // y quieto, cuando en realidad no se estaba midiendo nada.
    this.lastGoodAt = now;
    this.worker?.postMessage({ type: "reset" });
  }

  read(): PositionSample {
    // Congelar el cursor cuando el seguimiento lleva un rato perdido. Sin esto,
    // la extrapolación del filtro de la vista del jugador seguiría avanzando a
    // ciegas con la última velocidad conocida.
    const now = performance.now();
    if (this.lastGoodAt > 0 && now - this.lastGoodAt > HOLD_AFTER_LOST_MS) {
      this.sample = { ...this.sample, at: now, confidence: 0.3 };
      this.lastGoodAt = now;
    }
    return this.sample;
  }

  /** Envía un frame al worker por cada frame que entrega la cámara. */
  private pump(): void {
    const video = this.video;
    if (!this.running || !video) return;

    const onFrame = () => {
      if (!this.running) return;
      this.capture();
      this.pump();
    };

    // `requestVideoFrameCallback` avisa exactamente cuando hay imagen NUEVA.
    // Con `requestAnimationFrame` (60 Hz contra una cámara de 30) la mitad de
    // los frames serían repetidos: el worker mediría desplazamiento cero y el
    // cursor daría tirones.
    if (video.requestVideoFrameCallback) {
      this.frameHandle = video.requestVideoFrameCallback(onFrame);
    } else {
      this.rafHandle = requestAnimationFrame(onFrame);
    }
  }

  private capture(): void {
    const video = this.video;
    const worker = this.worker;
    if (!video || !worker || this.busy || video.readyState < 2) return;

    this.busy = true;
    const at = performance.now();
    // El giro se lee AQUÍ, no en el worker: hay que emparejarlo con el instante
    // del frame, y el worker no tiene acceso a los sensores.
    const rotation = sensorService.getRotationAngle();

    createImageBitmap(video)
      .then((bitmap) => {
        if (!this.running || !this.worker) {
          bitmap.close();
          this.busy = false;
          return;
        }
        // Se transfiere, no se copia: el bitmap es un handle a memoria de GPU.
        this.worker.postMessage(
          { type: "frame", bitmap, at, rotX: rotation.x, rotY: rotation.y },
          [bitmap]
        );
      })
      .catch(() => {
        this.busy = false;
      });
  }

  private onFlow(message: FlowMessage): void {
    this.busy = false;
    if (message.type !== "flow") return;
    this.onFirstFlow?.();
    if (message.confidence < MIN_CONFIDENCE) return;

    // Compensación del ladeo: el worker devuelve el movimiento en los ejes DEL
    // TELÉFONO, y el jugador no lo sujeta perfectamente vertical. Sin esto,
    // sujetarlo ladeado 30° haría que "mover a la derecha" moviera el cursor en
    // diagonal. La gravedad dice con qué ángulo se está sujetando.
    const g = sensorService.getGravity();
    // Ojo con el caso degenerado: `Math.atan2(-0, -0)` devuelve −π, NO cero.
    // Sin lectura de gravedad todavía —los primeros milisegundos, o un
    // navegador sin `devicemotion`— eso daría un ladeo de 180° y el mando
    // entero saldría invertido. Lo mismo con el teléfono plano boca arriba: ahí
    // la gravedad va por el eje Z y el ladeo sencillamente no está definido.
    const gPlanar = Math.hypot(g.x, g.y);
    const roll = gPlanar > 1 ? Math.atan2(-g.x, -g.y) : 0;
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);
    const worldX = message.tx * cos - message.ty * sin;
    const worldY = message.tx * sin + message.ty * cos;

    const scale = 0.5 / AIM_HALF_RANGE;
    this.accumX = clamp(this.accumX + worldX * scale, CLAMP);
    // El eje Y del teléfono apunta hacia ARRIBA y el de la pantalla hacia
    // abajo, de ahí el cambio de signo.
    this.accumY = clamp(this.accumY - worldY * scale, CLAMP);

    this.lastGoodAt = message.at;
    this.sample = {
      x: this.accumX,
      y: this.accumY,
      at: message.at,
      confidence: message.confidence,
    };
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** ¿Puede este dispositivo dar una cámara trasera? */
export function isOpticalFlowSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}
