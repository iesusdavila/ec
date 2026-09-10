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
 * El valor se eligió midiendo la convergencia desde un previo MÁXIMAMENTE
 * equivocado (una cámara que entregara la imagen girada 180°, el peor caso
 * posible): con 0,004 tardaba ~13 s en converger, y con 0,0005 tarda ~4 s, sin
 * perder nada en el caso normal. El previo sigue cubriendo los primeros
 * fotogramas, que es para lo único que está.
 */
const PRIOR_WEIGHT = 0.0005;
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
/**
 * La regresión se ajusta sobre las FLUCTUACIONES del giro, no sobre su valor
 * absoluto. Esta es la constante de tiempo (en fotogramas, a ~30 fps ≈ 2 s) del
 * promedio que se resta para obtenerlas.
 *
 * ESTO ARREGLA UN FALLO REAL, encontrado probando en un teléfono. Al llegar al
 * límite del alcance del brazo uno gira la muñeca y traslada el teléfono A LA
 * VEZ Y SIEMPRE IGUAL. Dos señales correlacionadas son inseparables por mínimos
 * cuadrados, así que la regresión metía la traslación DENTRO de M; a partir de
 * ahí M sobrecompensaba y cancelaba el movimiento real. Medido en el arnés
 * (§8.1): con movimiento acoplado el desplazamiento reportado caía de 0,0011 a
 * 0,0001 —contra un valor real de 0,012— y la focal aprendida se iba de 62 a
 * 36. En la mano, eso es el cursor clavado en el borde hasta pulsar
 * "Recentrar", que resetea la regresión.
 *
 * La parte CONSTANTE del giro es justo la que arrastra el acoplamiento;
 * quitándola queda el temblor natural de la mano, que no está correlacionado
 * con hacia dónde se mueve el brazo y por tanto sí identifica M limpiamente.
 * Con movimiento perfectamente acoplado no se aprende nada nuevo —la
 * información no está ahí— y se conserva el modelo anterior, que es la única
 * respuesta correcta.
 *
 * La constante de tiempo importa: tiene que ser bastante más lenta que el
 * temblor de la mano (~1-3 Hz) para no borrarlo, y bastante más rápida que una
 * partida para que sí borre el acoplamiento sostenido.
 */
const FLUCTUATION_TAU_FRAMES = 60;
/**
 * Fotogramas antes de fiarse del promedio de arriba y empezar a ajustar.
 *
 * No hace falta esperar a que el promedio converja del todo: con 20 fotogramas
 * ya distingue lo constante de lo fluctuante, y empezar antes acelera bastante
 * la convergencia cuando el valor previo resulta estar equivocado.
 *
 * Que se pueda empezar tan pronto depende de que el promedio sea la MEDIA REAL
 * desde el primer fotograma y no una exponencial arrancada en cero: ver
 * `baselineAlpha()`. Con la exponencial cruda, los primeros fotogramas dejaban
 * pasar toda la componente constante y el estimador se envenenaba justo con el
 * caso que esto viene a evitar.
 */
const BASELINE_WARMUP_FRAMES = 20;
/**
 * Flujo de rotación mínimo, en píxeles, para que un fotograma enseñe algo sobre
 * M. Por debajo el giro es del orden del ruido y solo ensuciaría la estimación.
 */
const MIN_ROTATION_FLOW_PX = 0.35;

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

  // Promedio lento del giro y del flujo por fotograma. Ver
  // FLUCTUATION_TAU_FRAMES: la regresión se ajusta sobre lo que se aparta de
  // estos promedios, no sobre los valores crudos.
  private gBarX = 0;
  private gBarY = 0;
  private mBarX = 0;
  private mBarY = 0;
  private baselineCount = 0;

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
    this.gBarX = 0;
    this.gBarY = 0;
    this.mBarX = 0;
    this.mBarY = 0;
    this.baselineCount = 0;
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

    // Promedio lento del giro y del flujo, para poder trabajar con sus
    // fluctuaciones. Ver FLUCTUATION_TAU_FRAMES y `baselineAlpha()`.
    this.baselineCount++;
    const alpha = baselineAlpha(this.baselineCount);
    this.gBarX += (gx - this.gBarX) * alpha;
    this.gBarY += (gy - this.gBarY) * alpha;
    this.mBarX += (match.dx - this.mBarX) * alpha;
    this.mBarY += (match.dy - this.mBarY) * alpha;

    // La regresión se ajusta SOLO sobre la parte fluctuante, y solo cuando esa
    // parte es un giro de verdad y no ruido. Un fotograma de traslación pura no
    // dice nada sobre M; uno de giro acoplado a la traslación, tampoco.
    const gTildeX = gx - this.gBarX;
    const gTildeY = gy - this.gBarY;
    const previous = this.getModel();
    const rotFlow = previous
      ? Math.hypot(
          previous.pitch.x * gTildeX + previous.yaw.x * gTildeY,
          previous.pitch.y * gTildeX + previous.yaw.y * gTildeY
        )
      : 0;

    if (
      confidence > MIN_CONFIDENCE_FOR_FIT &&
      this.baselineCount >= BASELINE_WARMUP_FRAMES &&
      rotFlow > MIN_ROTATION_FLOW_PX
    ) {
      const mTildeX = match.dx - this.mBarX;
      const mTildeY = match.dy - this.mBarY;
      this.a00 = this.a00 * FORGET + gTildeX * gTildeX;
      this.a01 = this.a01 * FORGET + gTildeX * gTildeY;
      this.a11 = this.a11 * FORGET + gTildeY * gTildeY;
      this.b0x = this.b0x * FORGET + gTildeX * mTildeX;
      this.b1x = this.b1x * FORGET + gTildeY * mTildeX;
      this.b0y = this.b0y * FORGET + gTildeX * mTildeY;
      this.b1y = this.b1y * FORGET + gTildeY * mTildeY;
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

/**
 * Peso de la muestra n en el promedio móvil.
 *
 * Arranca como media aritmética exacta (1/n) y va cediendo a la exponencial
 * (1/τ) según se acumulan muestras. Es el truco estándar de "arranque en
 * caliente", y aquí no es cosmético: una exponencial arrancada en cero tarda
 * decenas de fotogramas en alcanzar el valor real, y durante ese rato deja
 * pasar entera la componente constante del giro —justo la que arrastra el
 * acoplamiento que esto viene a filtrar—. Medido: sin esto, un movimiento
 * acoplado desde el primer fotograma envenenaba el modelo igual que antes.
 */
function baselineAlpha(n: number): number {
  return Math.max(1 / FLUCTUATION_TAU_FRAMES, 1 / n);
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
