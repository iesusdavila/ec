import type { GameEngine, GameEngineContext, InputMeta } from "@/games/types";
import type { GameResult } from "@/core/types";
import { DEFAULT_LATENCY_MS, MAX_LATENCY_MS } from "@/core/realtime/clockSync";

const BASE_ROUND_MS = 45000;
const SPAWN_MIN_MS_START = 700;
const SPAWN_MAX_MS_START = 1150;
const SPAWN_MIN_MS_END = 420;
const SPAWN_MAX_MS_END = 750;
/**
 * Vida de un objeto = duración completa de su arco. Antes eran 2000 ms, un
 * ritmo pensado para "agitar el teléfono" (no había que apuntar a nada). Con
 * puntería real hace falta más tiempo de vuelo: a 2 s el objeto recorría el
 * arco tan rápido que, con la latencia de red, ya se había movido fuera del
 * radio de corte antes de que el toque llegara al monitor.
 */
export const OBJECT_LIFETIME_MS = 2900;
/** Cuánto se deja el objeto en pantalla tras ser cortado, para la animación. */
export const SLICE_LINGER_MS = 450;
const POPUP_LIFETIME_MS = 750;
const BOMB_CHANCE = 0.2;
const FRUIT_POINTS = 10;
const BOMB_PENALTY = 10;

/**
 * Radio (en fracción del escenario) alrededor del punto/trazo del jugador
 * dentro del cual un corte alcanza a un objeto.
 *
 * El bug original: `handleInput` ignoraba la puntería y cortaba "el primer
 * objeto vivo del carril", así que una bomba junto a una fruta se cortaba sí o
 * sí. Ahora todo corte es posicional; este radio es la tolerancia.
 */
const SLICE_RADIUS = 0.19;
/**
 * Margen de incertidumbre alrededor de la latencia MEDIDA (ver más abajo).
 * La medición da la latencia de fondo; cada mensaje concreto puede llegar algo
 * antes o después. Se evalúa el objeto en ese abanico y se toma lo mejor, para
 * que el jitter de la red no le robe cortes al jugador.
 */
const LAG_JITTER_MS = 45;
/**
 * Velocidad mínima del cursor (fracciones de escenario por segundo) para que
 * un movimiento cuente como "barrido" que corta. Mover el puntero despacio
 * para recolocarlo NO corta: así se puede pasar junto a una bomba sin
 * detonarla, y hace falta un gesto decidido para cortar (como en el juego
 * clásico de cortar fruta).
 */
const SWIPE_MIN_SPEED = 1.0;
/**
 * Ventana sobre la que se mide esa velocidad.
 *
 * Es distinta del tramo que corta, y tiene que serlo. Ahora las muestras llegan
 * cada ~16 ms, y a esa distancia el ruido que le queda al sensor (~1% de
 * pantalla) se traduce en 0,7 pantallas/s de velocidad falsa: rozando el umbral
 * de barrido. Es decir, con la mano quieta el juego podría "barrer" solo y
 * detonar una bomba de propina.
 *
 * Medir la velocidad sobre ~50 ms baja ese ruido a ~0,2 pant/s y deja intacto
 * un barrido de verdad (2-4 pant/s). El TRAMO que corta sigue siendo el fino,
 * muestra a muestra, para que una curva no se pierda: una cosa es "¿este gesto
 * es decidido?" y otra "¿por dónde pasó exactamente?".
 */
const SWIPE_SPEED_WINDOW_MS = 50;
/** Hasta dónde se acepta retroceder buscando esa ventana. */
const SWIPE_SPEED_MAX_WINDOW_MS = SWIPE_SPEED_WINDOW_MS * 2;
/**
 * Cuánta cola del trazo se conserva entre lotes. Tiene que cubrir de sobra la
 * ventana de velocidad para que la PRIMERA muestra del lote siguiente ya la
 * tenga completa; el tope de puntos evita que un lote raro la haga crecer.
 */
const RECENT_TRAIL_MS = SWIPE_SPEED_WINDOW_MS * 2;
const RECENT_TRAIL_POINTS = 10;
/** Nadie mueve la mano más rápido que esto; por encima es un dato corrupto. */
const MAX_SAMPLE_DT_MS = 400;
/**
 * Constante de tiempo del suavizado del cursor en el monitor.
 *
 * Ojo con bajarla o subirla a lo tonto: ya NO es lo que da la sensación de
 * fluidez (de eso se encarga la extrapolación de abajo), solo absorbe el
 * salto cuando llega una posición nueva y la predicción se había desviado un
 * poco. Un valor pequeño = más nervioso pero más pegado a la mano.
 *
 * Ahora la posición que llega ya viene filtrada con Kalman en el teléfono, así
 * que este suavizado puede ser más corto que antes sin que se note ruido.
 */
const CURSOR_EASE_TAU_MS = 26;
/**
 * Extrapolación ("dead reckoning"), que es lo que hace que el puntero se vea
 * fluido con solo ~9 mensajes por segundo.
 *
 * Interpolar hacia la última posición recibida tiene un techo: el cursor
 * SIEMPRE va por detrás, porque persigue un punto que ya es viejo. Por eso
 * subir la frecuencia de envío se sentía como la única salida... y no se puede,
 * Pusher corta a 10 msg/s (§7.5 del HANDOFF).
 *
 * La solución es la de cualquier juego en red: el teléfono manda también su
 * VELOCIDAD, y el monitor avanza el cursor por su cuenta entre mensaje y
 * mensaje. Así el punto se dibuja donde la mano está AHORA, no donde estaba
 * hace 120 ms, y se ve continuo sin gastar un solo mensaje más.
 *
 * Novedad: además del tiempo transcurrido desde que llegó el mensaje, se
 * extrapola la LATENCIA MEDIDA de ese teléfono. La última muestra de un lote ya
 * nació vieja —lleva viajando por la red—, y hasta ahora ese tramo no se
 * compensaba: el cursor se dibujaba sistemáticamente por detrás de la mano.
 */
const MAX_EXTRAPOLATION_MS = 220;
/**
 * Tope de la extrapolación EN DISTANCIA, no solo en tiempo.
 *
 * Predecir tiene un riesgo conocido: cuando la mano frena de golpe, el monitor
 * todavía no lo sabe y sigue avanzando hasta que llega el siguiente mensaje,
 * con lo que el punto se pasa de largo y vuelve. Limitar cuánto puede adelantar
 * mantiene ese rebote dentro de lo imperceptible sin frenar el puntero en los
 * movimientos normales, que es donde la predicción hace falta.
 */
const MAX_EXTRAPOLATION_DIST = 0.22;
/**
 * Umbrales (en pantallas/s) entre los que la extrapolación se va activando.
 *
 * Extrapolar solo sirve para tapar la latencia MIENTRAS la mano se mueve. Con
 * la mano quieta no aporta nada y sí estorba: la velocidad estimada nunca es
 * exactamente cero —le queda el ruido residual del sensor— y multiplicarla por
 * ~130 ms convierte ese resto en un temblor visible del puntero. Justo lo que
 * se quería quitar.
 *
 * Por debajo de MIN no se extrapola nada (puntero clavado); por encima de FULL
 * se extrapola entero (puntero pegado a la mano); en medio, proporcional, para
 * que no se note el cambio de régimen.
 */
const EXTRAPOLATION_MIN_SPEED = 0.35;
const EXTRAPOLATION_FULL_SPEED = 0.9;
/** Cuánto recuerda el monitor el último acierto/fallo de un cursor (anillo). */
export const CURSOR_FX_MS = 260;

export const FRUIT_KINDS = ["apple", "watermelon", "orange", "banana"] as const;
export type FruitKind = (typeof FRUIT_KINDS)[number];
export type ObjectKind = FruitKind | "bomb";

/** Una muestra del puntero dentro de un lote. */
export interface AimSample {
  /** Posición en el escenario, 0..1. */
  x: number;
  y: number;
  /** ms desde la muestra anterior (la primera, desde el último lote enviado). */
  dt: number;
  /** 1 si el jugador tocó la pantalla justo en este instante. */
  cut?: 1;
}

/**
 * Entrada del jugador: un LOTE con toda la trayectoria del puntero desde el
 * envío anterior.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN LOTE Y NO UNA POSICIÓN SUELTA
 *
 * Pusher limita a 10 mensajes/s por conexión, así que antes se enviaba una
 * posición cada 120 ms y se TIRABAN las ~3 muestras intermedias. El monitor
 * recibía dos puntos separados 120 ms y unía con una recta: si el jugador hizo
 * una curva, la fruta que había en la curva no se cortaba, y un gesto rápido
 * quedaba registrado como un único salto largo cuya velocidad media podía caer
 * por debajo del umbral de barrido. Cortes perdidos sin culpa del jugador.
 *
 * El límite es de MENSAJES, no de bytes. Así que ahora el teléfono muestrea a
 * la velocidad del sensor (~60 Hz) y manda todas las muestras juntas en el
 * mismo mensaje. Misma cuota, resolución del trazo 7 veces mayor, y cada
 * muestra viene fechada para poder evaluarla contra el instante exacto en que
 * se hizo.
 *
 * El toque de la pantalla viaja como una marca (`cut`) sobre la muestra
 * correspondiente en vez de como un mensaje aparte. Antes era un mensaje suelto
 * que se sumaba a los ~8/s del puntero: al tocar varias veces seguidas se
 * pasaba de 10/s y Pusher descartaba justo el corte (el bug original de "no
 * corta nada"). Metido en el lote, un toque no puede pasarse de cuota nunca.
 * ---------------------------------------------------------------------------
 */
export type FruitSliceInput = {
  type: "aim";
  /** Trayectoria en orden cronológico; la última muestra es la más reciente. */
  s: AimSample[];
  /**
   * Velocidad estimada por el filtro de Kalman del teléfono en la última
   * muestra, en fracciones de escenario por segundo. El monitor la usa para
   * extrapolar entre mensajes (ver MAX_EXTRAPOLATION_MS).
   */
  vx: number;
  vy: number;
};

export interface FallingObject {
  id: number;
  kind: ObjectKind;
  x: number; // 0..1, posición horizontal dentro de su carril
  spawnedAt: number;
  sliced: boolean;
  slicedAt: number | null;
  slicedBy: string | null;
}

export interface ScorePopup {
  id: number;
  laneIndex: number;
  x: number;
  y: number;
  amount: number;
  spawnedAt: number;
}

export interface PlayerCursor {
  playerId: string;
  /** Índice del carril en el que apunta este jugador. */
  laneIndex: number;
  /** Posición dibujada: se interpola hacia el objetivo en cada tick. */
  x: number;
  y: number;
  /** Última posición recibida del teléfono (el objetivo real). */
  targetX: number;
  targetY: number;
  /** Velocidad reportada por el teléfono, en fracciones por segundo. */
  velX: number;
  velY: number;
  /** `elapsed` del último `aim`: edad de la muestra y velocidad del barrido. */
  lastAimAt: number;
  /** Latencia de un sentido medida para este teléfono, en ms. */
  latencyMs: number;
  /**
   * Cola de los últimos puntos del trazo, con su hora.
   *
   * Existe para que la velocidad del gesto siempre se pueda medir sobre una
   * ventana completa (SWIPE_SPEED_WINDOW_MS). Sin ella, los dos o tres
   * primeros tramos de cada lote se quedaban sin historia suficiente y su
   * velocidad se calculaba sobre 17 ms, donde el ruido del sensor manda:
   * medido, eso disparaba un corte accidental en el 7% de los lotes con la
   * mano completamente quieta.
   */
  recent: { x: number; y: number; t: number }[];
  /** `elapsed` ms del último corte acertado (anillo verde del monitor). */
  lastHitAt: number | null;
  /** `elapsed` ms del último corte al aire (anillo gris). */
  lastMissAt: number | null;
  /** Extremos del último trazo que cortó, para dibujar la estela. */
  trail: { ax: number; ay: number; bx: number; by: number; at: number } | null;
}

export interface FruitLane {
  /** Jugadores dueños de este carril. En modo compartido, todos comparten uno solo. */
  playerIds: string[];
  objects: FallingObject[];
  /** Momento (elapsed ms) del último impacto de bomba, para el efecto visual. */
  lastBombAt: number | null;
}

export interface FruitSliceState {
  phase: "playing" | "gameover";
  /** Tiempo transcurrido (ms) desde el inicio de la ronda; usado por el monitor para animar. */
  now: number;
  durationMs: number;
  remainingMs: number;
  splitScreen: boolean;
  lanes: FruitLane[];
  /** Cursor de cada jugador, indexado por su id. */
  cursors: Record<string, PlayerCursor>;
  popups: ScorePopup[];
  scores: Record<string, number>;
}

function randomFruitKind(): FruitKind {
  return FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Separación entre dos muestras, saneada: nunca 0 (dividiría entre cero). */
function sampleDt(dt: number): number {
  if (!Number.isFinite(dt)) return 16;
  return Math.min(MAX_SAMPLE_DT_MS, Math.max(1, dt));
}

/** Tope de la velocidad reportada, en fracciones de escenario por segundo. */
const MAX_REPORTED_VEL = 5;

function clampVel(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-MAX_REPORTED_VEL, Math.min(MAX_REPORTED_VEL, v));
}

/**
 * Altura del arco de un objeto según su progreso de vida (0..1).
 * `MonitorView` importa esta misma función: si el dibujo y el hit-test usaran
 * fórmulas distintas, el jugador apuntaría a un sitio y se cortaría en otro.
 */
export function arcY(progress: number): number {
  return 0.85 - 0.6 * Math.sin(clamp01(progress) * Math.PI);
}

/** Distancia de un punto al segmento AB (el trazo del puntero). */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Lo poco que el teléfono necesita saber de la partida. */
export interface FruitSlicePlayerState {
  phase: FruitSliceState["phase"];
  remainingSec: number;
  scores: Record<string, number>;
}

/**
 * Recorte del estado que se transmite a los teléfonos.
 *
 * El snapshot completo lleva la posición de cada fruta, cada cursor y cada
 * popup, y se emitía ~14 veces por segundo. Aquí el teléfono es solo un mando:
 * no dibuja nada de eso, pero igualmente tenía que recibirlo, parsearlo y
 * re-renderizar React con ello, robándole tiempo de CPU a lo único urgente, que
 * es muestrear el sensor y enviar la puntería. Ese atasco en el hilo principal
 * del móvil es la mitad del "tarda uno o dos segundos en llegar".
 *
 * Además, al ser pequeño y estable (el tiempo va redondeado a segundos), el
 * host detecta que no cambió y ni siquiera lo reenvía: la cuota de Pusher queda
 * casi entera para las entradas del jugador.
 */
export function fruitSliceToPlayerState(state: unknown): FruitSlicePlayerState {
  const fruit = state as FruitSliceState;
  return {
    phase: fruit.phase,
    remainingSec: Math.ceil(fruit.remainingMs / 1000),
    scores: fruit.scores,
  };
}

export function createFruitSliceEngine(
  context: GameEngineContext
): GameEngine<FruitSliceInput> {
  const durationMs = context.options.roundValue * 1000 || BASE_ROUND_MS;
  const splitScreen = context.options.splitScreen && context.players.length > 1;

  let elapsed = 0;
  let nextId = 1;
  let nextPopupId = 1;

  const lanes: FruitLane[] = splitScreen
    ? context.players.map((p) => ({ playerIds: [p.id], objects: [], lastBombAt: null }))
    : [{ playerIds: context.players.map((p) => p.id), objects: [], lastBombAt: null }];

  const laneIndexOf = (playerId: string) =>
    Math.max(0, lanes.findIndex((lane) => lane.playerIds.includes(playerId)));

  const nextSpawnAt = lanes.map(() => 0);

  const state: FruitSliceState = {
    phase: "playing",
    now: 0,
    durationMs,
    remainingMs: durationMs,
    splitScreen: Boolean(splitScreen),
    lanes,
    cursors: Object.fromEntries(
      context.players.map((p) => [
        p.id,
        {
          playerId: p.id,
          laneIndex: laneIndexOf(p.id),
          x: 0.5,
          y: 0.5,
          targetX: 0.5,
          targetY: 0.5,
          velX: 0,
          velY: 0,
          lastAimAt: 0,
          latencyMs: DEFAULT_LATENCY_MS,
          recent: [{ x: 0.5, y: 0.5, t: 0 }],
          lastHitAt: null,
          lastMissAt: null,
          trail: null,
        } satisfies PlayerCursor,
      ])
    ),
    popups: [],
    scores: Object.fromEntries(context.players.map((p) => [p.id, 0])),
  };

  function emit() {
    context.onStateChange(state);
  }

  function laneForPlayer(playerId: string): { lane: FruitLane; index: number } | null {
    const index = state.lanes.findIndex((lane) => lane.playerIds.includes(playerId));
    if (index === -1) return null;
    return { lane: state.lanes[index], index };
  }

  function difficultyProgress(): number {
    return Math.min(1, elapsed / durationMs);
  }

  function scheduleSpawn(laneIndex: number) {
    const t = difficultyProgress();
    const min = SPAWN_MIN_MS_START + (SPAWN_MIN_MS_END - SPAWN_MIN_MS_START) * t;
    const max = SPAWN_MAX_MS_START + (SPAWN_MAX_MS_END - SPAWN_MAX_MS_START) * t;
    nextSpawnAt[laneIndex] = elapsed + min + Math.random() * (max - min);
  }

  /** Altura del objeto en un instante dado (para compensar latencia). */
  function yAt(o: FallingObject, at: number): number {
    return arcY((at - o.spawnedAt) / OBJECT_LIFETIME_MS);
  }

  /**
   * Distancia mínima del objeto al trazo AB evaluando dónde estaba el objeto
   * cuando el jugador hizo el gesto, no dónde está ahora.
   *
   * `at` es ese instante, ya calculado con la latencia MEDIDA de este teléfono
   * (antes era una constante a ojo). Alrededor se prueba una ventanita de
   * jitter porque la latencia de fondo es estable pero cada mensaje concreto
   * varía unos ms.
   */
  function distanceToStroke(
    o: FallingObject,
    at: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    let best = Infinity;
    for (const offset of [0, -LAG_JITTER_MS, LAG_JITTER_MS]) {
      const d = distanceToSegment(o.x, yAt(o, at + offset), ax, ay, bx, by);
      if (d < best) best = d;
    }
    return best;
  }

  /** Un objeto está vivo en `at` si ya había salido y aún no había caído. */
  function isAliveAt(o: FallingObject, at: number): boolean {
    return !o.sliced && at - o.spawnedAt >= 0 && at - o.spawnedAt < OBJECT_LIFETIME_MS;
  }

  function registerSlice(
    playerId: string,
    cursor: PlayerCursor,
    lane: FruitLane,
    laneIndex: number,
    target: FallingObject,
    atX: number,
    atY: number
  ) {
    target.sliced = true;
    target.slicedAt = elapsed;
    target.slicedBy = playerId;
    cursor.lastHitAt = elapsed;

    const amount = target.kind === "bomb" ? -BOMB_PENALTY : FRUIT_POINTS;
    state.scores[playerId] = (state.scores[playerId] ?? 0) + amount;
    if (target.kind === "bomb") {
      lane.lastBombAt = elapsed;
    }
    state.popups.push({
      id: nextPopupId++,
      laneIndex,
      x: atX,
      y: atY,
      amount,
      spawnedAt: elapsed,
    });
  }

  return {
    getState: () => state,

    start: () => {
      state.lanes.forEach((_, i) => scheduleSpawn(i));
      emit();
    },

    handleInput: (playerId, input, meta?: InputMeta) => {
      if (state.phase !== "playing") return;
      const cursor = state.cursors[playerId];
      if (!cursor) return;
      const found = laneForPlayer(playerId);
      if (!found) return;
      const samples = input?.s;
      if (input?.type !== "aim" || !Array.isArray(samples) || samples.length === 0) return;

      const latency = Math.min(
        MAX_LATENCY_MS,
        Math.max(0, meta?.latencyMs ?? DEFAULT_LATENCY_MS)
      );
      cursor.latencyMs = latency;

      // Fecha de cada muestra en el reloj de la partida. La última se tomó hace
      // `latency` ms (lo que tardó el mensaje en llegar); las anteriores, tanto
      // como digan sus `dt`. Con esto, evaluar el gesto contra lo que había en
      // pantalla en ese instante es exacto y no una aproximación.
      const times = new Array<number>(samples.length);
      let ageFromLast = 0;
      for (let i = samples.length - 1; i >= 0; i--) {
        times[i] = elapsed - latency - ageFromLast;
        ageFromLast += sampleDt(samples[i].dt);
      }

      // Trayectoria a evaluar: el rastro reciente (solo aporta ventana para
      // medir velocidad, sus tramos ya se evaluaron) más las muestras nuevas.
      const fresh = samples.map((s, i) => ({ x: clamp01(s.x), y: clamp01(s.y), t: times[i] }));
      // Si la latencia estimada cambió de golpe, la línea de tiempo puede
      // solaparse con el rastro anterior; esos puntos se descartan. Siempre
      // queda al menos un punto de anclaje delante de las muestras nuevas.
      const kept = cursor.recent.filter((p) => p.t < fresh[0].t);
      const history = kept.length > 0
        ? kept
        : [{ x: cursor.targetX, y: cursor.targetY, t: fresh[0].t - sampleDt(samples[0].dt) }];
      const path = [...history, ...fresh];

      let swiped = false;

      for (let i = history.length; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        const at = to.t;

        // Velocidad medida sobre una ventana amplia (ver SWIPE_SPEED_WINDOW_MS)
        // para que el ruido no la infle; el tramo que corta sigue siendo el fino.
        //
        // El retroceso se corta en SWIPE_SPEED_MAX_WINDOW_MS: si el punto
        // anterior es mucho más viejo (primer lote de la partida, o el jugador
        // acaba de estar parado), anclarse en él repartiría el gesto entre
        // cientos de milisegundos y ningún barrido llegaría al umbral.
        let back = i - 1;
        while (back > 0 && to.t - path[back].t < SWIPE_SPEED_WINDOW_MS) {
          if (to.t - path[back - 1].t > SWIPE_SPEED_MAX_WINDOW_MS) break;
          back--;
        }
        const spanMs = Math.max(1, to.t - path[back].t);
        const speed = Math.hypot(to.x - path[back].x, to.y - path[back].y) / (spanMs / 1000);

        // Corte por barrido: el tramo recorrido corta todo lo que atraviesa,
        // siempre que el gesto sea decidido (ver SWIPE_MIN_SPEED). Al mirar
        // cada tramo por separado, un gesto en curva ya no se convierte en la
        // recta entre dos puntos separados 120 ms.
        if (speed >= SWIPE_MIN_SPEED) {
          swiped = true;
          for (const o of found.lane.objects) {
            if (!isAliveAt(o, at)) continue;
            if (distanceToStroke(o, at, from.x, from.y, to.x, to.y) <= SLICE_RADIUS) {
              // El "+10" se coloca donde el objeto se DIBUJA (el monitor lo
              // congela en `elapsed` al marcarlo cortado), no donde estaba
              // cuando el gesto lo alcanzó.
              registerSlice(playerId, cursor, found.lane, found.index, o, o.x, yAt(o, elapsed));
            }
          }
        }

        // Toque explícito en esta muestra: corta el objeto más cercano.
        if (samples[i - history.length]?.cut) {
          let best: FallingObject | undefined;
          let bestDist = SLICE_RADIUS;
          for (const o of found.lane.objects) {
            if (!isAliveAt(o, at)) continue;
            const d = distanceToStroke(o, at, to.x, to.y, to.x, to.y);
            if (d <= bestDist) {
              bestDist = d;
              best = o;
            }
          }
          if (best) {
            registerSlice(playerId, cursor, found.lane, found.index, best, to.x, to.y);
          } else {
            // Corte al aire: sin penalización, solo un anillo tenue.
            cursor.lastMissAt = elapsed;
          }
        }
      }

      const last = path[path.length - 1];
      if (swiped) {
        // La estela dibuja el lote entero (unos 110 ms de recorrido), que es
        // justo el trazo que el jugador percibe como "el corte".
        cursor.trail = {
          ax: fresh[0].x,
          ay: fresh[0].y,
          bx: last.x,
          by: last.y,
          at: elapsed,
        };
      }

      // Se guarda cola suficiente para que el próximo lote tenga ventana de
      // velocidad desde su primera muestra.
      cursor.recent = path.filter((p) => last.t - p.t <= RECENT_TRAIL_MS).slice(-RECENT_TRAIL_POINTS);
      cursor.targetX = last.x;
      cursor.targetY = last.y;
      cursor.velX = clampVel(input.vx);
      cursor.velY = clampVel(input.vy);
      cursor.lastAimAt = elapsed;
      emit();
    },

    tick: (dtMs) => {
      if (state.phase !== "playing") return;
      elapsed += dtMs;
      state.now = elapsed;
      state.remainingMs = Math.max(0, durationMs - elapsed);

      // Cursor: se predice dónde está la mano ahora (última posición conocida
      // + velocidad × tiempo transcurrido desde esa muestra) y se suaviza el
      // acercamiento. Esto es lo que convierte ~8 mensajes por segundo en un
      // movimiento que se ve continuo y pegado a la mano.
      const ease = 1 - Math.exp(-dtMs / CURSOR_EASE_TAU_MS);
      for (const cursor of Object.values(state.cursors)) {
        // Cuánto hay que adelantar: lo que el mensaje tardó en llegar (la
        // muestra ya nació vieja) más lo que lleva esperando al siguiente.
        const sinceArrival = Math.max(0, elapsed - cursor.lastAimAt);
        const aheadS = Math.min(MAX_EXTRAPOLATION_MS, cursor.latencyMs + sinceArrival) / 1000;
        // Solo se extrapola si la mano se está moviendo de verdad.
        const speed = Math.hypot(cursor.velX, cursor.velY);
        const gate = clamp01(
          (speed - EXTRAPOLATION_MIN_SPEED) /
            (EXTRAPOLATION_FULL_SPEED - EXTRAPOLATION_MIN_SPEED)
        );
        let leadX = cursor.velX * aheadS * gate;
        let leadY = cursor.velY * aheadS * gate;
        const lead = Math.hypot(leadX, leadY);
        if (lead > MAX_EXTRAPOLATION_DIST) {
          const scale = MAX_EXTRAPOLATION_DIST / lead;
          leadX *= scale;
          leadY *= scale;
        }
        const predictedX = clamp01(cursor.targetX + leadX);
        const predictedY = clamp01(cursor.targetY + leadY);
        cursor.x += (predictedX - cursor.x) * ease;
        cursor.y += (predictedY - cursor.y) * ease;
      }

      state.lanes.forEach((lane, i) => {
        if (elapsed >= nextSpawnAt[i]) {
          lane.objects.push({
            id: nextId++,
            kind: Math.random() < BOMB_CHANCE ? "bomb" : randomFruitKind(),
            x: 0.12 + Math.random() * 0.76,
            spawnedAt: elapsed,
            sliced: false,
            slicedAt: null,
            slicedBy: null,
          });
          scheduleSpawn(i);
        }

        lane.objects = lane.objects.filter((o) =>
          o.sliced
            ? elapsed - (o.slicedAt ?? elapsed) < SLICE_LINGER_MS
            : elapsed - o.spawnedAt < OBJECT_LIFETIME_MS
        );
      });

      state.popups = state.popups.filter((p) => elapsed - p.spawnedAt < POPUP_LIFETIME_MS);

      if (state.remainingMs <= 0) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const ranking = Object.keys(state.scores).sort((a, b) => state.scores[b] - state.scores[a]);
      return {
        ranking,
        scores: state.scores,
        winnerId: ranking[0] ?? null,
      };
    },

    cleanup: () => {},
  };
}
