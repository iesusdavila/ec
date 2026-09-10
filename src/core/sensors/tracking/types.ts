/**
 * Contrato de un rastreador de POSICIÓN del teléfono.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTO EXISTE Y POR QUÉ NO SE PUEDE HACER CON EL ACELERÓMETRO
 *
 * Hasta ahora Corta frutas apuntaba con la INCLINACIÓN: el ángulo del teléfono
 * se mapeaba a una posición de pantalla. Eso hace que el mando se comporte como
 * el joystick de un mando de consola —centro fijo, solo se puede girar—, que es
 * justo lo que no queríamos: queremos mover el teléfono POR EL ESPACIO y que el
 * cursor lo siga.
 *
 * La tentación es integrar el acelerómetro dos veces. No funciona, y no es
 * cuestión de escribir mejor el código: la información no está en la señal.
 * Un acelerómetro mide fuerza específica, y "quieto pero inclinado 0,5°" produce
 * EXACTAMENTE la misma lectura que "acelerando a 0,086 m/s²" —son físicamente
 * indistinguibles—. Al integrar dos veces ese error se acumula al cuadrado:
 *
 *     1 s → 4 cm     2 s → 17 cm     3 s → 39 cm     5 s → 1,07 m
 *
 * El espacio de juego (hombro a hombro, pecho a cabeza) mide ~50-60 cm, así que
 * el cursor se saldría de la pantalla en dos o tres segundos de cada ronda.
 * Ningún filtro arregla esto, tampoco el Kalman de `../KalmanFilter.ts`: un
 * filtro corrige contra una referencia absoluta, y aquí no hay ninguna.
 * Tampoco es una limitación del navegador — la Generic Sensor API define ocho
 * sensores (acelerómetro, giroscopio, gravedad, magnetómetro, orientación
 * absoluta y relativa, luz ambiente) y NINGUNO da posición; Android tampoco
 * tiene un sensor de posición, ARCore la construye con la cámara.
 *
 * La única fuente real de posición en un teléfono es, por tanto, LA CÁMARA.
 * De ahí las dos implementaciones de esta interfaz:
 *
 *   - `XrPoseTracker`     delega en ARCore vía WebXR. Preciso y robusto, pero
 *                          solo Android y obliga a entrar en sesión AR.
 *   - `OpticalFlowTracker` lo calculamos nosotros: flujo óptico a baja
 *                          resolución con la rotación descontada por giroscopio.
 *                          Menos preciso, pero universal y sin secuestrar la
 *                          pantalla.
 *
 * `createPositionTracker()` elige el mejor disponible y cae al modo inclinación
 * de siempre si no hay ninguno.
 * ---------------------------------------------------------------------------
 */

export type PositionTrackerKind = "xr" | "optical-flow";

export interface PositionSample {
  /**
   * Desplazamiento respecto al punto recentrado, en fracciones de escenario y
   * ya en COORDENADAS DE PANTALLA: +x = derecha, +y = ABAJO. 0,5 es medio
   * escenario, así que ±0,5 son los bordes.
   */
  x: number;
  y: number;
  /**
   * `performance.now()` de la medición que produjo este valor. Si no cambia
   * entre dos lecturas es que aún no hay dato nuevo, igual que en
   * `SensorService.getTiltSample()`: el bucle del juego corre a 60 fps y la
   * cámara entrega ~30, así que sin esto el filtro entendería "la mano se paró"
   * en la mitad de los frames y frenaría el cursor sin motivo.
   */
  at: number;
  /**
   * 0..1. Cae cuando la escena no tiene textura suficiente para medir el
   * movimiento (pared lisa, poca luz) o cuando el seguimiento se perdió. El
   * consumidor debe tratar una muestra de confianza baja como "no hay dato
   * nuevo" en vez de como "no se movió".
   */
  confidence: number;
}

export interface PositionTracker {
  readonly kind: PositionTrackerKind;
  /** Debe llamarse DENTRO de un gesto del usuario (permiso de cámara / sesión AR). */
  start(): Promise<void>;
  stop(): void;
  /** Fija la posición actual como centro del escenario. */
  recenter(): void;
  read(): PositionSample;
  /**
   * `false` cuando el rastreador ha dejado de funcionar por su cuenta —el caso
   * real es que el jugador salga de la sesión AR con el gesto de "atrás"—. El
   * juego debe caer entonces al modo inclinación en vez de quedarse con un
   * cursor congelado.
   */
  isAlive(): boolean;
}

export type PositionTrackingStatus =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "active"; kind: PositionTrackerKind }
  /** No hay forma de rastrear posición: el juego debe caer al modo inclinación. */
  | { state: "unavailable"; reason: string };
