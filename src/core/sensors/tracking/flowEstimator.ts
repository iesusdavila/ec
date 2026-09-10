/**
 * El cálculo puro del flujo óptico, sin nada del navegador.
 *
 * Está separado de `flowWorker.ts` por una razón concreta: aquí vive la parte
 * que puede estar sutilmente mal sin que se note —los signos, la convención de
 * ejes, la convergencia de la regresión— y con el DOM de por medio no habría
 * forma de comprobarla salvo probando en un teléfono a ojo. Sin `OffscreenCanvas`
 * ni `ImageBitmap` se puede alimentar con imágenes sintéticas y verificar que
 * una traslación conocida sale con el valor y el SIGNO correctos.
 * El worker se queda solo con "cámara → array de luminancia".
 *
 * ---------------------------------------------------------------------------
 * CÓMO SE SEPARA "GIRÉ EL TELÉFONO" DE "MOVÍ EL TELÉFONO"
 *
 * Es el problema de fondo: en la imagen, girar la cámara y trasladarla producen
 * el mismo tipo de desplazamiento. Sin separarlos, girar la muñeca movería el
 * cursor — que es exactamente el comportamiento de joystick que se quería
 * eliminar.
 *
 * La clave es que el giroscopio mide la rotación con precisión y sin deriva
 * relevante en la escala de un frame (33 ms), y que el flujo que produce una
 * rotación es lineal en el ángulo: `m = M·g`, con `M` una matriz 2×2 que
 * depende de la óptica.
 *
 * En vez de deducir `M` de la geometría —lo que exigiría saber la distancia
 * focal, con qué orientación entrega el navegador los frames y si hay espejado,
 * distinto en cada teléfono— se APRENDE por mínimos cuadrados mientras se
 * juega. La rotación de la mano es constante e involuntaria, así que hay datos
 * de sobra. Se parte de un valor previo razonable y las medidas reales lo
 * corrigen en un par de segundos, incluidos el signo y un intercambio de ejes.
 *
 * Lo que queda tras restar `M·g` es flujo puramente traslacional.
 * ---------------------------------------------------------------------------
 */

/** Nivel fino de la pirámide. Más resolución no mejora: el ruido domina antes. */
export const FLOW_W = 64;
export const FLOW_H = 48;
const CW = FLOW_W / 2;
const CH = FLOW_H / 2;

/** Búsqueda en el nivel grueso, en píxeles gruesos (= el doble de finos). */
const COARSE_RADIUS = 6;
/** Refinado alrededor del resultado grueso, en píxeles finos. */
const FINE_RADIUS = 2;
const FINE_INSET = COARSE_RADIUS * 2 + FINE_RADIUS;
const COARSE_INSET = COARSE_RADIUS + 1;

/**
 * Distancia focal inicial en píxeles del nivel fino, para un campo de visión
 * horizontal típico de teléfono (~65°): f = (W/2) / tan(FOV/2). Es solo la
 * semilla de la regresión; el valor real lo aprende `solveModel()`.
 */
const F0 = FLOW_W / 2 / Math.tan((65 * Math.PI) / 180 / 2);
/**
 * Peso del valor previo, en las MISMAS unidades que los acumuladores de la
 * regresión, que suman g² (radianes²).
 *
 * La escala importa muchísimo y es fácil equivocarse: la mano gira, jugando,
 * unos 20°/s, o sea ~0,012 rad entre fotograma y fotograma, lo que aporta
 * g² ≈ 1,4·10⁻⁴ por fotograma y ~4·10⁻³ por segundo. Un previo de peso 1 —no
 * digamos 40— tardaría horas en ser superado: la focal se quedaría clavada en
 * la estimada y la compensación de giro nunca sería exacta.
 *
 * 0,004 equivale a un segundo de rotación suave: manda al principio, y en un
 * par de segundos de juego normal las medidas reales pesan más que él.
 */
const PRIOR_WEIGHT = 0.004;
/**
 * Rango de focal creíble en píxeles del nivel fino: de un teleobjetivo
 * imposible (~30° de campo) a un gran angular extremo (~120°). Fuera de aquí,
 * la regresión ha aprendido basura (una escena repetitiva que engaña al
 * emparejamiento, por ejemplo) y es mejor volver al previo.
 */
const MIN_PLAUSIBLE_FOCAL = 15;
const MAX_PLAUSIBLE_FOCAL = 130;
/**
 * Olvido por frame. A 30 fps, 0,997 da una constante de tiempo de ~11 s: la
 * matriz sigue a un cambio real sin bailar con el ruido.
 */
const FORGET = 0.997;
/** Por debajo de esta varianza la escena no tiene textura que seguir. */
const MIN_VARIANCE = 12;
/** Confianza mínima para dejar que un frame actualice la regresión. */
const MIN_CONFIDENCE_FOR_FIT = 0.4;

export interface FlowResult {
  /**
   * Traslación del teléfono en sus propios ejes (+x a su derecha, +y hacia
   * arriba), medida como razón `traslación / profundidad`.
   *
   * NO son metros: con una sola cámara la escala real es inobservable —no se
   * distingue moverse 10 cm cerca de una pared de moverse 40 cm lejos—. Da
   * igual para este juego, que solo necesita proporcionalidad.
   */
  tx: number;
  ty: number;
  /** 0..1. Cae con poca textura, poca luz o seguimiento perdido. */
  confidence: number;
}

interface Match {
  dx: number;
  dy: number;
  /** Coste del mejor encaje y del peor, en la rejilla gruesa. Ver `confidence`. */
  bestCost: number;
  worstCost: number;
}

export interface FlowModel {
  /** Columna asociada al cabeceo (giro sobre el eje X), en px por radián. */
  pitch: { x: number; y: number };
  /** Columna asociada a la guiñada (giro sobre el eje Y). */
  yaw: { x: number; y: number };
}

/** El modelo que codifica `seedPrior()`, para poder volver a él. */
const PRIOR_MODEL: FlowModel = { pitch: { x: 0, y: F0 }, yaw: { x: F0, y: 0 } };

export class FlowEstimator {
  private prevFine: Float32Array | null = null;
  private prevCoarse: Float32Array | null = null;
  private prevRotX = 0;
  private prevRotY = 0;
  private hasPrevRot = false;

  // Acumuladores de la regresión: `a*` es Σ g·gᵀ y `b*` es Σ g·mᵀ.
  private a00 = 0;
  private a01 = 0;
  private a11 = 0;
  private b0x = 0;
  private b1x = 0;
  private b0y = 0;
  private b1y = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.prevFine = null;
    this.prevCoarse = null;
    this.hasPrevRot = false;
    this.seedPrior();
  }

  /**
   * Valor previo de la matriz, deducido de la convención más habitual: el
   * navegador entrega el frame ya orientado como la pantalla, con la Y de
   * imagen creciendo hacia abajo.
   *
   *  - Un giro positivo sobre el eje X (cabeceo) apunta la cámara hacia arriba,
   *    así que la escena baja en la imagen: flujo +y.
   *  - Un giro positivo sobre el eje Y (guiñada) gira la cámara hacia la
   *    izquierda —la regla de la mano derecha lleva −Z hacia −X, y la cámara
   *    trasera mira por −Z—, así que la escena se va a la derecha: flujo +x.
   *
   * Es decir M ≈ [[0, f], [f, 0]]. Si en algún teléfono no es así, la regresión
   * lo corrige sola; por eso el peso del previo es bajo.
   */
  private seedPrior(): void {
    this.a00 = PRIOR_WEIGHT;
    this.a01 = 0;
    this.a11 = PRIOR_WEIGHT;
    this.b0x = 0;
    this.b1x = PRIOR_WEIGHT * F0;
    this.b0y = PRIOR_WEIGHT * F0;
    this.b1y = 0;
  }

  /** Modelo aprendido hasta ahora. Expuesto para poder inspeccionarlo. */
  getModel(): FlowModel | null {
    const det = this.a00 * this.a11 - this.a01 * this.a01;
    if (Math.abs(det) < 1e-12) return null;
    const m00 = (this.a11 * this.b0x - this.a01 * this.b1x) / det;
    const m01 = (-this.a01 * this.b0x + this.a00 * this.b1x) / det;
    const m10 = (this.a11 * this.b0y - this.a01 * this.b1y) / det;
    const m11 = (-this.a01 * this.b0y + this.a00 * this.b1y) / det;

    const fPitch = Math.hypot(m00, m10);
    const fYaw = Math.hypot(m01, m11);
    if (
      fPitch < MIN_PLAUSIBLE_FOCAL ||
      fPitch > MAX_PLAUSIBLE_FOCAL ||
      fYaw < MIN_PLAUSIBLE_FOCAL ||
      fYaw > MAX_PLAUSIBLE_FOCAL
    ) {
      return PRIOR_MODEL;
    }
    return { pitch: { x: m00, y: m10 }, yaw: { x: m01, y: m11 } };
  }

  /**
   * Procesa un frame.
   *
   * @param luma  Luminancia cruda del frame, FLOW_W × FLOW_H, sin normalizar.
   * @param rotX  Giro ACUMULADO sobre el eje X del teléfono, en radianes.
   * @param rotY  Ídem sobre el eje Y.
   */
  push(luma: Float32Array, rotX: number, rotY: number): FlowResult {
    const { fine, coarse, variance } = prepare(luma);

    const prevF = this.prevFine;
    const prevC = this.prevCoarse;
    this.prevFine = fine;
    this.prevCoarse = coarse;

    const gx = this.hasPrevRot ? rotX - this.prevRotX : 0;
    const gy = this.hasPrevRot ? rotY - this.prevRotY : 0;
    const hadPrevRot = this.hasPrevRot;
    this.prevRotX = rotX;
    this.prevRotY = rotY;
    this.hasPrevRot = true;

    // Sin frame anterior, o con una escena sin textura (pared lisa, poca luz),
    // no hay nada que medir. Se avisa con confianza 0 en vez de devolver un
    // cero, que el consumidor leería como "el teléfono está quieto".
    if (!prevF || !prevC || !hadPrevRot || variance < MIN_VARIANCE) {
      return { tx: 0, ty: 0, confidence: 0 };
    }

    const match = matchFrames(prevF, fine, prevC, coarse);

    // Confianza: lo DISTINTIVO que es el encaje, no lo pequeño que es su
    // residuo.
    //
    // La primera versión comparaba el residuo contra la varianza de la escena,
    // y estaba mal: en una escena de poco contraste —una pared en penumbra, que
    // es justo cuando más falta hace saber si el dato vale— el ruido del sensor
    // basta para que el residuo supere ese umbral y TODAS las medidas se
    // descartaran, con el cursor clavado sin que nada lo delatase.
    //
    // Comparar el mejor encaje contra el PEOR de la misma búsqueda normaliza
    // solo el nivel de ruido, que afecta a ambos por igual. Si hay un
    // desplazamiento real, el óptimo destaca; si los fotogramas no guardan
    // relación (seguimiento perdido) todos los costes se parecen y la confianza
    // se hunde, que es lo que se quiere saber.
    const confidence =
      match.worstCost > 1e-6
        ? Math.max(0, Math.min(1, 1 - match.bestCost / match.worstCost))
        : 1;

    // Actualizar la regresión SOLO con frames donde hay rotación: son los que
    // informan sobre M. En un frame de traslación pura, `m` no tiene nada que
    // ver con `g` y solo metería ruido en la estimación.
    const gMag2 = gx * gx + gy * gy;
    if (confidence > MIN_CONFIDENCE_FOR_FIT && gMag2 > 1e-6) {
      this.a00 = this.a00 * FORGET + gx * gx;
      this.a01 = this.a01 * FORGET + gx * gy;
      this.a11 = this.a11 * FORGET + gy * gy;
      this.b0x = this.b0x * FORGET + gx * match.dx;
      this.b1x = this.b1x * FORGET + gy * match.dx;
      this.b0y = this.b0y * FORGET + gx * match.dy;
      this.b1y = this.b1y * FORGET + gy * match.dy;
    }

    const model = this.getModel();
    if (!model) return { tx: 0, ty: 0, confidence: 0 };

    // Flujo que explica la ROTACIÓN, y lo que sobra: la traslación.
    const rx = match.dx - (model.pitch.x * gx + model.yaw.x * gy);
    const ry = match.dy - (model.pitch.y * gx + model.yaw.y * gy);

    // Proyección del residuo sobre los ejes del dispositivo.
    //
    // Las columnas de M dan, medidas en ESTE teléfono, hacia dónde se mueve la
    // imagen cuando la cámara cabecea o guiña. Y una traslación produce flujo
    // en esa misma dirección de imagen, porque geométricamente "la cámara barre
    // horizontalmente" es lo mismo venga de girar o de desplazarse. Solo cambia
    // el sentido, y de forma conocida:
    //
    //  - guiñada positiva gira la cámara a la IZQUIERDA, mientras que
    //    trasladarse en +X va a la derecha → sentidos opuestos, signo negativo.
    //  - cabeceo positivo apunta la cámara ARRIBA, igual que trasladarse en +Y
    //    → mismo sentido.
    //
    // Usar las columnas MEDIDAS en vez de constantes es lo que hace que esto
    // funcione igual con la imagen girada, espejada o con los ejes cambiados.
    const fYaw2 = model.yaw.x * model.yaw.x + model.yaw.y * model.yaw.y;
    const fPitch2 = model.pitch.x * model.pitch.x + model.pitch.y * model.pitch.y;
    if (fYaw2 < 1e-6 || fPitch2 < 1e-6) return { tx: 0, ty: 0, confidence: 0 };

    return {
      tx: -(rx * model.yaw.x + ry * model.yaw.y) / fYaw2,
      ty: (rx * model.pitch.x + ry * model.pitch.y) / fPitch2,
      confidence,
    };
  }
}

/** Normaliza a media cero y construye el nivel grueso de la pirámide. */
function prepare(luma: Float32Array): {
  fine: Float32Array;
  coarse: Float32Array;
  variance: number;
} {
  const fine = new Float32Array(FLOW_W * FLOW_H);
  let sum = 0;
  for (let i = 0; i < fine.length; i++) {
    fine[i] = luma[i];
    sum += luma[i];
  }
  const mean = sum / fine.length;

  // Restar la media hace el emparejamiento inmune al autoexposición de la
  // cámara, que cambia el brillo global entre frames y falsearía el SSD.
  let variance = 0;
  for (let i = 0; i < fine.length; i++) {
    fine[i] -= mean;
    variance += fine[i] * fine[i];
  }
  variance /= fine.length;

  const coarse = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const s = y * 2 * FLOW_W + x * 2;
      coarse[y * CW + x] = (fine[s] + fine[s + 1] + fine[s + FLOW_W] + fine[s + FLOW_W + 1]) / 4;
    }
  }

  return { fine, coarse, variance };
}

/**
 * Suma de diferencias al cuadrado entre el frame actual y el anterior
 * desplazado (ox, oy). Menor = mejor encaje.
 */
function ssd(
  prev: Float32Array,
  cur: Float32Array,
  w: number,
  h: number,
  inset: number,
  ox: number,
  oy: number
): number {
  let sum = 0;
  let n = 0;
  for (let y = inset; y < h - inset; y++) {
    const rowCur = y * w;
    const rowPrev = (y + oy) * w + ox;
    for (let x = inset; x < w - inset; x++) {
      const d = cur[rowCur + x] - prev[rowPrev + x];
      sum += d * d;
      n++;
    }
  }
  return n > 0 ? sum / n : Infinity;
}

/** Vértice de la parábola que pasa por (−1,a) (0,b) (1,c), acotado a ±0,5. */
function subpixel(a: number, b: number, c: number): number {
  const denom = a - 2 * b + c;
  if (denom <= 1e-6) return 0;
  return Math.max(-0.5, Math.min(0.5, (a - c) / (2 * denom)));
}

/** Búsqueda gruesa-a-fina del desplazamiento global entre los dos frames. */
function matchFrames(
  prevF: Float32Array,
  curF: Float32Array,
  prevC: Float32Array,
  curC: Float32Array
): Match {
  let bestCx = 0;
  let bestCy = 0;
  let bestCost = Infinity;
  let worstCost = 0;
  for (let oy = -COARSE_RADIUS; oy <= COARSE_RADIUS; oy++) {
    for (let ox = -COARSE_RADIUS; ox <= COARSE_RADIUS; ox++) {
      const cost = ssd(prevC, curC, CW, CH, COARSE_INSET, ox, oy);
      if (cost < bestCost) {
        bestCost = cost;
        bestCx = ox;
        bestCy = oy;
      }
      if (cost > worstCost) worstCost = cost;
    }
  }
  const coarseBest = bestCost;

  const baseX = bestCx * 2;
  const baseY = bestCy * 2;
  const side = FINE_RADIUS * 2 + 1;
  const grid = new Float32Array(side * side);
  let bestFx = 0;
  let bestFy = 0;
  bestCost = Infinity;
  for (let iy = 0; iy < side; iy++) {
    const oy = baseY + iy - FINE_RADIUS;
    for (let ix = 0; ix < side; ix++) {
      const ox = baseX + ix - FINE_RADIUS;
      const cost = ssd(prevF, curF, FLOW_W, FLOW_H, FINE_INSET, ox, oy);
      grid[iy * side + ix] = cost;
      if (cost < bestCost) {
        bestCost = cost;
        bestFx = ix;
        bestFy = iy;
      }
    }
  }

  // Interpolación subpíxel: sin esto la resolución del puntero sería de un
  // píxel de 64, que a media pantalla son saltos perfectamente visibles.
  let sx = 0;
  let sy = 0;
  if (bestFx > 0 && bestFx < side - 1) {
    sx = subpixel(
      grid[bestFy * side + bestFx - 1],
      grid[bestFy * side + bestFx],
      grid[bestFy * side + bestFx + 1]
    );
  }
  if (bestFy > 0 && bestFy < side - 1) {
    sy = subpixel(
      grid[(bestFy - 1) * side + bestFx],
      grid[bestFy * side + bestFx],
      grid[(bestFy + 1) * side + bestFx]
    );
  }

  // OJO CON EL SIGNO. La búsqueda devuelve el desplazamiento de la VENTANA que
  // hace encajar el fotograma anterior con el actual, y eso es justo lo
  // contrario del flujo: si el contenido se ha ido 3 px a la derecha, la
  // ventana que lo reencuentra está 3 px a la IZQUIERDA. Se niega aquí, una
  // sola vez, para que todo lo de fuera hable de flujo —que es el lenguaje en
  // el que está escrita la geometría de `seedPrior()` y de la proyección—.
  return {
    dx: -(baseX + bestFx - FINE_RADIUS + sx),
    dy: -(baseY + bestFy - FINE_RADIUS + sy),
    bestCost: coarseBest,
    worstCost,
  };
}
