/**
 * Worker de flujo óptico: convierte los frames de la cámara trasera en el
 * desplazamiento del teléfono.
 *
 * Aquí solo está la parte que necesita el navegador (bitmap → luminancia); toda
 * la matemática vive en `flowEstimator.ts`, que no depende del DOM y por eso se
 * puede probar con imágenes sintéticas.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EN UN WORKER
 *
 * No es una preferencia de estilo. Según §7.6 del HANDOFF, la causa raíz del
 * "hay uno o dos segundos de retardo" de Corta frutas nunca fue la red: era el
 * hilo principal del teléfono saturado de renders, con los envíos de Pusher
 * esperando turno detrás. Procesar 30 imágenes por segundo en ese mismo hilo
 * reproduciría el bug a lo grande. Aquí solo entra un `ImageBitmap` (un handle,
 * se transfiere sin copiar) y sale un vector de dos números.
 * ---------------------------------------------------------------------------
 */

import { FlowEstimator, FLOW_H, FLOW_W } from "@/core/sensors/tracking/flowEstimator";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

const estimator = new FlowEstimator();
const luma = new Float32Array(FLOW_W * FLOW_H);

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

function readLuma(bitmap: ImageBitmap): boolean {
  if (!canvas) {
    canvas = new OffscreenCanvas(FLOW_W, FLOW_H);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return false;

  // El escalado a 64×48 lo hace el propio `drawImage`, en la GPU.
  ctx.drawImage(bitmap, 0, 0, FLOW_W, FLOW_H);
  const data = ctx.getImageData(0, 0, FLOW_W, FLOW_H).data;
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    // Luma aproximada; los coeficientes exactos no cambian nada aquí.
    luma[i] = (data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28) / 256;
  }
  return true;
}

scope.onmessage = (event: MessageEvent) => {
  const data = event.data as
    | { type: "frame"; bitmap: ImageBitmap; at: number; rotX: number; rotY: number }
    | { type: "reset" };

  if (data.type === "reset") {
    estimator.reset();
    return;
  }

  const ok = readLuma(data.bitmap);
  data.bitmap.close();
  if (!ok) {
    scope.postMessage({ type: "flow", at: data.at, tx: 0, ty: 0, confidence: 0 });
    return;
  }

  const flow = estimator.push(luma, data.rotX, data.rotY);
  scope.postMessage({ type: "flow", at: data.at, ...flow });
};
