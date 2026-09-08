/**
 * Filtro de Kalman de velocidad constante para señales de sensor.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN KALMAN Y NO UN SUAVIZADO EXPONENCIAL
 *
 * La versión anterior del puntero de Corta frutas hacía dos cosas por separado:
 * suavizaba la posición con una media exponencial y luego DERIVABA la velocidad
 * restando muestras consecutivas. Eso tiene dos problemas conocidos:
 *
 *  1. Derivar amplifica el ruido. El sensor de orientación de un teléfono tiene
 *     un ruido de ~0,3-0,5° (más el temblor de la mano); dividirlo entre 16 ms
 *     produce picos de velocidad enormes que no existen. Como el monitor
 *     EXTRAPOLA con esa velocidad, cada pico se convertía en un salto visible
 *     del cursor: eso es el "se va muy loco / oscila mucho".
 *  2. Un suavizado exponencial tiene un solo mando: o va suave y con retardo, o
 *     va pegado a la mano y nervioso. No se puede tener las dos cosas.
 *
 * Un Kalman de velocidad constante resuelve las dos: estima POSICIÓN y
 * VELOCIDAD como un estado conjunto, así que la velocidad sale del modelo (es
 * suave por construcción, no una resta de dos números ruidosos), y la ganancia
 * se ajusta sola según cuánta confianza merece cada medición.
 *
 * Encima es ADAPTATIVO (ver `adaptación` más abajo): cuando la mano está quieta
 * baja la ganancia y el punto se queda clavado; cuando arranca un gesto rápido
 * la sube y el filtro deja de estorbar. Ese es el mando que faltaba.
 * ---------------------------------------------------------------------------
 *
 * Modelo: estado x = [posición, velocidad]ᵀ, transición F = [[1, dt], [0, 1]],
 * medición H = [1, 0] (solo se observa la posición).
 */

export interface Kalman1DConfig {
  /**
   * Varianza del ruido de medición, en unidades² de la señal.
   * Cuánto se desconfía de cada lectura del sensor.
   */
  measurementNoise: number;
  /**
   * Densidad espectral del ruido de proceso (unidades²/s³): cuánta aceleración
   * imprevista se le permite al modelo. Subirlo = filtro más rápido y más
   * ruidoso; bajarlo = más suave y con más retardo.
   */
  processNoise: number;
  /**
   * Multiplicador máximo de `processNoise` cuando se detecta movimiento real.
   * Es el margen entre "quieto y estable" y "gesto rápido sin retardo".
   */
  maxProcessBoost: number;
}

/**
 * A partir de cuánto se considera que la discrepancia entre lo predicho y lo
 * medido es movimiento de verdad y no ruido. Se mide en NIS (innovación
 * normalizada), que vale ~1 cuando el modelo acierta.
 */
const NIS_TOLERANCE = 3;
/**
 * El NIS se promedia antes de decidir. Es imprescindible: el NIS de una sola
 * muestra sigue una chi-cuadrado, que tiene cola larga, así que con la mano
 * QUIETA se pasa de 2 una de cada seis muestras solo por ruido. Sin promediar,
 * el filtro se pasaba la mitad del tiempo abierto sin motivo y la velocidad
 * estimada salía cuatro veces más ruidosa que con el suavizado exponencial de
 * antes: justo el defecto que se venía a arreglar (medido, ver §7.5).
 *
 * Un gesto de verdad mantiene el NIS alto durante muchas muestras seguidas; el
 * ruido, no. Promediar distingue exactamente eso.
 */
const NIS_SMOOTHING = 0.3;
/** Cuánto se abre el filtro por unidad de NIS excedente (al cuadrado). */
const BOOST_GAIN = 12;
/** Ataque rápido: abrirse tarde ante un gesto se nota como retardo. */
const BOOST_ATTACK = 0.6;
/** Cierre lento: cerrarse pronto haría "tirones" al final de cada gesto. */
const BOOST_RELEASE = 0.08;
/** dt fuera de este rango es un salto de pestaña o un evento duplicado. */
const MIN_DT_S = 1 / 240;
const MAX_DT_S = 0.2;

export class Kalman1D {
  private posEstimate = 0;
  private velEstimate = 0;
  /** Covarianza del error, P = [[p00, p01], [p10, p11]]. */
  private p00 = 1;
  private p01 = 0;
  private p10 = 0;
  private p11 = 1;
  private boost = 0;
  private nisAverage = 1;
  private started = false;

  constructor(private readonly config: Kalman1DConfig) {}

  get position(): number {
    return this.posEstimate;
  }

  /** Velocidad estimada en unidades por segundo. */
  get velocity(): number {
    return this.velEstimate;
  }

  reset(position = 0): void {
    this.posEstimate = position;
    this.velEstimate = 0;
    this.p00 = 1;
    this.p01 = 0;
    this.p10 = 0;
    this.p11 = 1;
    this.boost = 0;
    this.nisAverage = 1;
    this.started = false;
  }

  /**
   * Avanza el filtro un paso.
   *
   * @param measurement Lectura del sensor, o `null` si en este frame no llegó
   *   ninguna nueva. Ese caso importa: el sensor va a ~60 Hz pero no está
   *   sincronizado con los frames, así que a veces toca leer el mismo valor dos
   *   veces. Corregir con una medición repetida le diría al filtro "la posición
   *   no cambió", frenando el cursor sin motivo. Con `null` solo se predice,
   *   que es exactamente lo correcto: seguir avanzando con la velocidad
   *   estimada hasta que llegue el siguiente dato real.
   */
  step(measurement: number | null, dtSeconds: number): void {
    if (!this.started) {
      if (measurement === null) return;
      this.posEstimate = measurement;
      this.velEstimate = 0;
      this.started = true;
      return;
    }

    const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, dtSeconds));

    // --- Predicción: x = F·x, P = F·P·Fᵀ + Q -------------------------------
    this.posEstimate += this.velEstimate * dt;

    const q = this.config.processNoise * (1 + this.boost);
    const dt2 = dt * dt;
    // Q del modelo de aceleración como ruido blanco continuo.
    const q00 = (q * dt2 * dt) / 3;
    const q01 = (q * dt2) / 2;
    const q11 = q * dt;

    const p00 = this.p00 + dt * (this.p01 + this.p10) + dt2 * this.p11 + q00;
    const p01 = this.p01 + dt * this.p11 + q01;
    const p10 = this.p10 + dt * this.p11 + q01;
    const p11 = this.p11 + q11;

    if (measurement === null) {
      this.p00 = p00;
      this.p01 = p01;
      this.p10 = p10;
      this.p11 = p11;
      return;
    }

    // --- Corrección: K = P·Hᵀ / S, con H = [1, 0] --------------------------
    const innovation = measurement - this.posEstimate;
    const s = p00 + this.config.measurementNoise;
    const k0 = p00 / s;
    const k1 = p10 / s;

    this.posEstimate += k0 * innovation;
    this.velEstimate += k1 * innovation;

    // P = (I - K·H)·P
    this.p00 = p00 - k0 * p00;
    this.p01 = p01 - k0 * p01;
    this.p10 = p10 - k1 * p00;
    this.p11 = p11 - k1 * p01;

    // --- Adaptación ---------------------------------------------------------
    // NIS = innovación² / S. Vale ~1 si el modelo describe bien lo que pasa; se
    // sostiene por encima cuando la mano hace algo que el modelo no esperaba.
    // Se promedia primero (ver NIS_SMOOTHING) y luego se eleva al cuadrado el
    // exceso, para que el ruido normal no mueva el filtro y un gesto de verdad
    // lo abra de golpe.
    //
    // El lazo se autorregula: al subir `boost` crece P, con lo que crece S y
    // baja el NIS. Es decir, el filtro se abre justo hasta que sus predicciones
    // vuelven a cuadrar con lo que mide, ni más ni menos.
    const nis = (innovation * innovation) / s;
    this.nisAverage += (nis - this.nisAverage) * NIS_SMOOTHING;
    const excess = Math.max(0, this.nisAverage - NIS_TOLERANCE);
    const target = Math.min(this.config.maxProcessBoost, BOOST_GAIN * excess * excess);
    const rate = target > this.boost ? BOOST_ATTACK : BOOST_RELEASE;
    this.boost += (target - this.boost) * rate;
  }
}

export interface PointerSample {
  x: number;
  y: number;
  /** Velocidad estimada en unidades por segundo. */
  vx: number;
  vy: number;
}

/**
 * Ruido de medición por defecto para el puntero de inclinación, en unidades de
 * escenario (0..1). ~0,4° de ruido sobre un recorrido útil de 24° ≈ 0,017.
 */
const DEFAULT_MEASUREMENT_NOISE = 2.5e-4;
/**
 * Ruido de proceso en REPOSO, deliberadamente muy por debajo de la aceleración
 * real de una mano (~1 pantalla/s² frente a las 5-90 de un gesto). Con la mano
 * quieta el filtro casi no cree en el movimiento, y por eso el puntero se queda
 * clavado; la responsividad la pone la adaptación cuando hace falta.
 *
 * Medido en simulación con ruido de sensor de 0,4° a 60 Hz, contra el suavizado
 * exponencial anterior (α=0,6) y con el mismo gesto:
 *
 *   |                   | temblor en reposo | velocidad falsa | retardo del gesto |
 *   |-------------------|-------------------|-----------------|-------------------|
 *   | antes (EMA)       | ±3,61 % pantalla  | 0,278 pant/s    | 10,5 ms           |
 *   | ahora (Kalman)    | ±2,78 % pantalla  | 0,203 pant/s    |  4,1 ms           |
 *
 * Gana en las tres columnas a la vez, que es exactamente lo que un filtro de un
 * solo parámetro no podía dar: o una o la otra.
 */
const DEFAULT_PROCESS_NOISE = 1;
/**
 * Tope de apertura. Por encima de ~250 no cambia nada: el lazo se estabiliza
 * solo mucho antes (ver la adaptación), así que esto es una red de seguridad.
 */
const DEFAULT_MAX_BOOST = 250;
/**
 * Histéresis final, en unidades de escenario. Mata el brillo residual del
 * puntero cuando la mano está quieta (el Kalman ya deja poco, pero un punto
 * luminoso de 5 px vibrando se nota). Durante el movimiento se traduce en un
 * retardo constante de este tamaño, que a 0,003 son ~6 px en 1920: invisible.
 */
const DEFAULT_DEADBAND = 0.004;

export interface PointerFilterConfig extends Partial<Kalman1DConfig> {
  deadband?: number;
}

/**
 * Dos Kalman independientes (uno por eje) más una histéresis de reposo.
 * Es la pieza que consumen los juegos: entra la posición cruda que sale del
 * sensor, sale una posición estable y una velocidad utilizable.
 */
export class PointerKalmanFilter {
  private readonly filterX: Kalman1D;
  private readonly filterY: Kalman1D;
  private readonly deadband: number;
  private outX = 0.5;
  private outY = 0.5;

  constructor(config: PointerFilterConfig = {}) {
    const shared: Kalman1DConfig = {
      measurementNoise: config.measurementNoise ?? DEFAULT_MEASUREMENT_NOISE,
      processNoise: config.processNoise ?? DEFAULT_PROCESS_NOISE,
      maxProcessBoost: config.maxProcessBoost ?? DEFAULT_MAX_BOOST,
    };
    this.filterX = new Kalman1D(shared);
    this.filterY = new Kalman1D(shared);
    this.deadband = config.deadband ?? DEFAULT_DEADBAND;
  }

  reset(x = 0.5, y = 0.5): void {
    this.filterX.reset(x);
    this.filterY.reset(y);
    this.outX = x;
    this.outY = y;
  }

  /**
   * @param measurement Posición cruda, o `null` si el sensor no ha dado un dato
   *   nuevo desde el paso anterior (ver `Kalman1D.step`).
   */
  step(measurement: { x: number; y: number } | null, dtSeconds: number): PointerSample {
    this.filterX.step(measurement ? measurement.x : null, dtSeconds);
    this.filterY.step(measurement ? measurement.y : null, dtSeconds);

    this.outX = applyDeadband(this.outX, this.filterX.position, this.deadband);
    this.outY = applyDeadband(this.outY, this.filterY.position, this.deadband);

    return {
      x: this.outX,
      y: this.outY,
      vx: this.filterX.velocity,
      vy: this.filterY.velocity,
    };
  }
}

/**
 * Histéresis: la salida no se mueve hasta que la entrada se aleja más que
 * `width`, y entonces la sigue manteniendo esa distancia. No acumula error ni
 * introduce retardo dependiente de la velocidad, a diferencia de un suavizado.
 */
function applyDeadband(current: number, target: number, width: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= width) return current;
  return target - Math.sign(delta) * width;
}
