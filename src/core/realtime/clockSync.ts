/**
 * Medición de la latencia real teléfono → monitor, sin gastar mensajes.
 *
 * ---------------------------------------------------------------------------
 * Los juegos con puntería tienen que compensar la latencia: el jugador apunta a
 * lo que VE en el monitor, y para cuando su gesto llega, la fruta ya se movió.
 * Corta frutas lo hacía con una constante a ojo (`LAG_SAMPLES_MS = [0, 90,
 * 180]`), que es correcta solo por casualidad: en una wifi buena sobra y en
 * datos móviles se queda corta.
 *
 * Aquí se mide de verdad, aprovechando mensajes que ya existían:
 *
 *   1. El host sella cada snapshot de estado con su reloj (`t`).
 *   2. El teléfono anota ese sello y CUÁNDO lo recibió (reloj local).
 *   3. Al mandar su siguiente entrada, adjunta el sello y cuánto tiempo lo
 *      tuvo retenido: `{ hs, ha }`.
 *   4. El host resta: ida y vuelta = ahora − hs − ha. Una sola dirección ≈ /2.
 *
 * Los relojes de los dos aparatos no tienen que estar sincronizados: las dos
 * restas ocurren cada una dentro de un mismo dispositivo.
 * ---------------------------------------------------------------------------
 */

export interface ClockEcho {
  /** Último sello de reloj del host que vio este teléfono. */
  hs: number;
  /** ms que el teléfono lo retuvo antes de devolverlo. */
  ha: number;
}

export interface ClockEchoTracker {
  /** Llamar al recibir del host un mensaje sellado. */
  note: (hostStamp: number) => void;
  /** Eco listo para adjuntar a la siguiente entrada, o `null` si aún no hay. */
  read: () => ClockEcho | null;
}

export function createClockEchoTracker(): ClockEchoTracker {
  let stamp: number | null = null;
  let receivedAt = 0;

  return {
    note(hostStamp: number) {
      if (typeof hostStamp !== "number") return;
      stamp = hostStamp;
      receivedAt = performance.now();
    },
    read() {
      if (stamp === null) return null;
      return { hs: stamp, ha: Math.round(performance.now() - receivedAt) };
    },
  };
}

/** Latencia supuesta mientras no hay ninguna medición todavía. */
export const DEFAULT_LATENCY_MS = 70;
/** Tope de compensación: por encima de esto, algo va mal y compensar empeora. */
export const MAX_LATENCY_MS = 320;
/** Muestras sobre las que se toma la mediana. ~1 s de historia a 9 msg/s. */
const WINDOW = 9;

/**
 * Estimador de latencia de un sentido, en el lado del host y por jugador.
 *
 * Usa la MEDIANA, no la media: en una red móvil un mensaje suelto puede tardar
 * medio segundo, y una media lo arrastraría todo. La mediana ignora esos picos
 * y sigue la latencia de fondo, que es la que hay que compensar.
 */
export class LatencyEstimator {
  private samples: number[] = [];

  /**
   * @param echo Eco recibido del teléfono.
   * @param now  Reloj del host en el momento de recibirlo (misma base que el
   *   sello que el host puso en el snapshot).
   */
  addEcho(echo: ClockEcho | null | undefined, now: number): void {
    if (!echo || typeof echo.hs !== "number" || typeof echo.ha !== "number") return;
    const roundTrip = now - echo.hs - echo.ha;
    // Un valor negativo o absurdo significa que el eco venía de otra partida o
    // que el reloj saltó: se descarta en vez de contaminar la mediana.
    if (roundTrip < 0 || roundTrip > 2 * MAX_LATENCY_MS * 4) return;
    this.samples.push(roundTrip / 2);
    if (this.samples.length > WINDOW) this.samples.shift();
  }

  /** Latencia de un sentido en ms, ya acotada y lista para compensar. */
  get oneWayMs(): number {
    if (this.samples.length === 0) return DEFAULT_LATENCY_MS;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.min(MAX_LATENCY_MS, Math.max(0, median));
  }

  get sampleCount(): number {
    return this.samples.length;
  }
}
