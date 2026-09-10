import type { GameEngine, GameEngineContext } from "@/games/types";
import type { GameResult } from "@/core/types";
import {
  applyPadInput,
  clearPresses,
  createPadState,
  isHeld,
  takePress,
  type PadInput,
  type PadState,
} from "@/games/runtime/padInput";

/**
 * TORRE INFINITA — carrera vertical de plataformas.
 *
 * Todos trepan la MISMA torre en la pantalla del monitor, y la cámara sube
 * sola: sigue al que va primero y además tiene una velocidad mínima que crece
 * con el tiempo. Quien se queda abajo sale por el borde inferior y pierde una
 * vida. Esa es toda la tensión del juego, y es lo que lo hace multijugador de
 * verdad en vez de varias partidas de un jugador en la misma pantalla: quien
 * va delante decide a qué ritmo tienen que ir los demás.
 *
 * El mando es un botón a cada lado y uno de saltar. Nada más.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ TANTA CONSTANTE PARA "SALTAR"
 *
 * Un salto que solo aplique una velocidad hacia arriba se siente rígido y
 * tramposo, y en un juego de precisión la culpa siempre parece del mando. Las
 * tres piezas que lo arreglan son de manual y están todas aquí:
 *
 *  - ALTURA VARIABLE: soltar el botón antes corta el impulso. Da control fino
 *    sobre saltos cortos sin necesitar un segundo botón.
 *  - COYOTE: se puede saltar hasta un pelín DESPUÉS de dejar la plataforma.
 *    Sin esto, el jugador jura que pulsó a tiempo, y tiene razón: pulsó dentro
 *    del margen en el que su cerebro creía que aún estaba en el suelo.
 *  - BÚFER: un salto pulsado justo ANTES de aterrizar no se tira a la basura,
 *    se guarda y sale al tocar el suelo. Sin esto, encadenar saltos rápidos
 *    obliga a un ritmo antinatural.
 *
 * Y aquí importan el doble, porque entre el dedo y la simulación hay una red:
 * lo que en local serían unos milisegundos, aquí son varias decenas. Ver
 * `runtime/padInput.ts`.
 * ---------------------------------------------------------------------------
 */

// --- Mundo ---------------------------------------------------------------
export const WORLD_W = 160;
/** Alto de la ventana visible. La torre no tiene techo. */
export const VIEW_H = 90;
const PLAYER_W = 7;
const PLAYER_H = 10;
export const PLATFORM_H = 2.6;

// --- Física --------------------------------------------------------------
const GRAVITY = 260;
/**
 * Velocidad máxima de caída.
 *
 * Está en todos los juegos de plataformas y aquí hace falta el doble: sin
 * tope, caer desde un muelle alcanza 174 unidades por segundo y el jugador
 * atraviesa tres bandas antes de poder reaccionar. Con tope hay tiempo de
 * mover el cuerpo hacia una plataforma y salvar la caída, que es la diferencia
 * entre "he fallado el salto" y "he perdido una vida sin poder hacer nada".
 */
const MAX_FALL_SPEED = 118;
const MOVE_ACCEL = 700;
const MAX_SPEED = 52;
const GROUND_FRICTION = 9;
const ICE_FRICTION = 0.7;
const AIR_CONTROL = 0.55;
/** Da un vértice de v²/2g ≈ 19 unidades: algo más que el hueco entre bandas. */
const JUMP_VELOCITY = 100;
const SPRING_VELOCITY = 178;
const JUMP_CUT = 0.45;
const COYOTE_MS = 110;
const JUMP_BUFFER_MS = 130;
/** Rebote al caer sobre la cabeza de otro, y empujón que se lleva el pisado. */
const STOMP_BOUNCE = 86;
const STOMP_PUSH = -26;

// --- Reglas --------------------------------------------------------------
const LIVES = 3;
const RESPAWN_INVULNERABLE_MS = 1400;
const CRUMBLE_MS = 380;
/**
 * Cuánto tarda en volver una plataforma que se rompió.
 *
 * No es un adorno: sin esto, romper una plataforma podía dejar un hueco de dos
 * bandas —24 unidades— por encima de un salto de 18, y quien estuviera debajo
 * se quedaba encerrado sin forma de subir. En el arnés se veía como un bot que
 * trepaba hasta 59 y ya no pasaba de ahí. Que vuelvan convierte ese callejón
 * sin salida en una espera de dos segundos, que además es una decisión
 * interesante cuando tienes a alguien pisándote los talones.
 */
const CRUMBLE_RESPAWN_MS = 2400;
/** Cuánto por debajo del borde inferior se tolera antes de perder una vida. */
const DEATH_MARGIN = 7;
/**
 * Cuánta ventana se deja POR DEBAJO del que va primero.
 *
 * Es, en la práctica, cuánto se puede uno caer sin morir (más DEATH_MARGIN).
 * Con 34 el arnés mostró que un bot capaz de subir 261 unidades igual se
 * quedaba sin vidas: no lo mataba la prisa, lo mataba SU PROPIA cámara, porque
 * fallar un salto y caer tres bandas ya te dejaba fuera de plano.
 */
const CAMERA_LEAD = 46;
/**
 * Máxima velocidad a la que la cámara alcanza al líder.
 *
 * Sin este tope, la cámara se pega al líder al instante, y entonces un muelle
 * —que lanza a 178 unidades por segundo— la dispara hacia arriba y se lleva por
 * delante a todos los demás por algo que ni siquiera hicieron ellos. En un
 * juego donde el líder ya marca el ritmo, eso es demasiado poder.
 */
const CAMERA_CATCH_UP = 26;
/**
 * Hueco que el líder tiene garantizado por debajo, pase lo que pase.
 *
 * Sin esto el juego era injusto de raíz, y el arnés lo enseñó: la subida
 * forzada se sumaba POR ENCIMA del seguimiento, así que la cámara terminaba
 * adelantando al que iba primero y se lo comía por muy bien que jugara. Un bot
 * capaz de subir 302 unidades acababa igual sin vidas.
 *
 * Con este tope, la presión de la cámara deja de castigar al líder y pasa a
 * castigar a quien se queda atrás, que es justo lo que se quería: en una
 * partida, el ritmo lo marca el que va delante.
 */
const CAMERA_MIN_LEAD = 12;
/** Velocidad mínima de subida de la cámara y cuánto acelera con el tiempo. */
const RISE_BASE = 1.8;
const RISE_RAMP_PER_S = 0.035;

// --- Generación ----------------------------------------------------------
const BAND_GAP = 12;
const BAND_JITTER = 2;
/**
 * Separación horizontal máxima entre los CENTROS de una plataforma y la de la
 * banda siguiente.
 *
 * No es el hueco que hay que saltar: como las plataformas miden 20-38 de
 * ancho, el peor hueco entre BORDES son 38 − 20 = 18 unidades. Medido en el
 * arnés, un salto con carrerilla cubre 26, así que quedan 8 de margen. Los
 * números están así de atados a propósito: es lo único que garantiza que la
 * torre se pueda subir SIEMPRE, y un hueco imposible cada muchas bandas
 * aparecería en mitad de una partida sin que nadie supiera por qué.
 */
const REACH_X = 38;
const PLATFORM_MIN_W = 20;
const PLATFORM_MAX_W = 38;
/** Se genera por encima de la cámara y se tira lo que ya quedó muy abajo. */
const GENERATE_AHEAD = VIEW_H * 2;
const PRUNE_BELOW = 30;

export type PlatformKind = "solid" | "moving" | "crumble" | "spring" | "ice";

export interface Platform {
  id: number;
  kind: PlatformKind;
  x: number;
  y: number;
  w: number;
  /**
   * Solo `moving`: origen de la oscilación, amplitud, velocidad y fase.
   *
   * `x` guarda siempre la posición ACTUAL, no la de origen. Es importante:
   * cualquiera que lea el estado —el monitor para dibujar, sin ir más lejos—
   * tiene que ver dónde está la plataforma ahora, no dónde nació.
   */
  homeX?: number;
  amp?: number;
  speed?: number;
  phase?: number;
  /** Cuánto se movió en el último paso, para arrastrar a quien va encima. */
  dx?: number;
  /** Solo `crumble`: cuándo terminará de romperse, o null si nadie la pisó. */
  breakAt?: number | null;
  /** Solo `crumble`: cuándo volverá tras haberse roto. */
  restoreAt?: number | null;
  gone?: boolean;
  /** Marca de animación para el monitor: instante del último rebote. */
  bouncedAt?: number;
}

export interface TowerPlayer {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  lives: number;
  out: boolean;
  /** Altura máxima alcanzada en el mundo. La usa la cámara para seguir al líder. */
  best: number;
  /**
   * Altura REGALADA por las reapariciones, que se descuenta de la puntuación.
   *
   * Al perder una vida se reaparece cerca del borde inferior de la cámara, que
   * puede estar mucho más arriba de donde caíste. Sin descontarlo, morir subía
   * la puntuación: en una partida de prueba GANÓ el jugador que no hizo nada,
   * porque tres reapariciones lo habían ido subiendo. La altura que no se ha
   * trepado no cuenta.
   */
  liftedByRespawn: number;
  invulnerableUntil: number;
  /** Solo para el monitor: instante del último salto y del último golpe. */
  jumpedAt: number;
  hurtAt: number;
}

export interface TowerState {
  phase: "climbing" | "gameover";
  elapsedMs: number;
  durationMs: number;
  cameraY: number;
  riseSpeed: number;
  platforms: Platform[];
  players: TowerPlayer[];
}

/** Lo único que el teléfono necesita saber: si sigue en juego. */
export interface TowerPlayerState {
  lives: Record<string, number>;
  over: boolean;
}

export function towerToPlayerState(state: unknown): TowerPlayerState {
  const tower = state as TowerState;
  return {
    lives: Object.fromEntries(tower.players.map((p) => [p.id, p.out ? 0 : p.lives])),
    over: tower.phase === "gameover",
  };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Reparto de tipos de plataforma según la altura.
 *
 * Arriba del todo casi no quedan plataformas quietas: es lo que hace que la
 * dificultad crezca sin tocar la física ni meter prisa artificial.
 */
function pickKind(height: number): PlatformKind {
  const difficulty = Math.min(1, height / 900);
  const roll = Math.random();
  if (roll < 0.06 + difficulty * 0.04) return "spring";
  if (roll < 0.18 + difficulty * 0.16) return "moving";
  if (roll < 0.28 + difficulty * 0.24) return "crumble";
  if (roll < 0.34 + difficulty * 0.3) return "ice";
  return "solid";
}

export function createTowerClimbEngine(context: GameEngineContext): GameEngine<PadInput> {
  const durationMs = (context.options.roundValue || 90) * 1000;
  const pads = new Map<string, PadState>();
  /** Instante del último salto pulsado, para el búfer. */
  const jumpBufferedAt = new Map<string, number>();
  /** Instante en que se dejó de tocar suelo, para el coyote. */
  const leftGroundAt = new Map<string, number>();
  const jumpHeld = new Map<string, boolean>();

  let platformId = 0;
  let generatedUpTo = 0;
  /** Reloj propio del motor en ms; no depende del reloj de pared. */
  let now = 0;

  const platforms: Platform[] = [];

  // Suelo inicial: una plataforma de lado a lado para que nadie empiece cayendo.
  platforms.push({ id: platformId++, kind: "solid", x: 0, y: 0, w: WORLD_W });

  /** Plataformas de la última banda generada, para garantizar alcance. */
  let lastBand: Platform[] = [platforms[0]];

  function generateTo(topY: number): void {
    while (generatedUpTo < topY) {
      const y = generatedUpTo + BAND_GAP + randomBetween(-BAND_JITTER, BAND_JITTER);
      generatedUpTo = y;

      // Más bandas dobles que simples: con una sola plataforma estrecha por
      // banda, una caída larga atraviesa varias sin tocar nada y no hay forma
      // humana de salvarla.
      const count = Math.random() < 0.62 ? 2 : 1;
      const band: Platform[] = [];
      for (let i = 0; i < count; i++) {
        // Anclar a una plataforma de la banda anterior es lo que garantiza que
        // la torre SE PUEDA subir. Colocando al azar en 160 de ancho salen
        // huecos de 100 unidades, imposibles de saltar, y el juego se atasca.
        const anchor = lastBand[Math.floor(Math.random() * lastBand.length)];
        const anchorCenter = anchor.x + anchor.w / 2;
        const w = randomBetween(PLATFORM_MIN_W, PLATFORM_MAX_W);
        const center = clamp(
          anchorCenter + randomBetween(-REACH_X, REACH_X),
          w / 2,
          WORLD_W - w / 2
        );
        const left = center - w / 2;
        band.push(makePlatform(pickKind(y), left, y, w));
      }
      for (const platform of band) platforms.push(platform);
      lastBand = band;
    }
  }

  function makePlatform(kind: PlatformKind, left: number, y: number, w: number): Platform {
    if (kind === "moving") {
      // Amplitud que quepa a AMBOS lados sin salirse del mundo. Aquí hubo un
      // `Math.max(6, amp)` que anulaba justo este cálculo cuando el hueco era
      // pequeño, y la plataforma se salía de la pantalla; lo cazó el arnés
      // comprobando los límites del mundo. Si no hay sitio para oscilar, es
      // mejor una plataforma normal que una móvil que en realidad no se mueve.
      const room = Math.min(left, WORLD_W - w - left);
      const amp = Math.min(randomBetween(16, 32), room);
      if (amp >= 6) {
        return {
          id: platformId++,
          kind,
          x: left,
          y,
          w,
          homeX: left,
          amp,
          speed: randomBetween(0.5, 1.0),
          phase: Math.random() * Math.PI * 2,
          dx: 0,
        };
      }
      kind = "solid";
    }
    const platform: Platform = { id: platformId++, kind, x: left, y, w };
    if (kind === "crumble") platform.breakAt = null;
    return platform;
  }

  generateTo(VIEW_H * 2);

  const state: TowerState = {
    phase: "climbing",
    elapsedMs: 0,
    durationMs,
    cameraY: 0,
    riseSpeed: RISE_BASE,
    platforms,
    players: context.players.map((player, index) => ({
      id: player.id,
      // Repartidos a lo ancho del suelo para que no empiecen encima.
      x: ((index + 1) * WORLD_W) / (context.players.length + 1),
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      lives: LIVES,
      out: false,
      best: 0,
      liftedByRespawn: 0,
      invulnerableUntil: 0,
      jumpedAt: -1,
      hurtAt: -1,
    })),
  };

  function emit(): void {
    context.onStateChange(state);
  }

  function padFor(playerId: string): PadState {
    let pad = pads.get(playerId);
    if (!pad) {
      pad = createPadState();
      pads.set(playerId, pad);
    }
    return pad;
  }

  /** Avanza la oscilación de las plataformas móviles. */
  function movePlatforms(): void {
    for (const platform of platforms) {
      if (platform.kind !== "moving" || platform.gone) continue;
      const next =
        (platform.homeX ?? platform.x) +
        Math.sin((now / 1000) * (platform.speed ?? 1) + (platform.phase ?? 0)) *
          (platform.amp ?? 0);
      platform.dx = next - platform.x;
      platform.x = next;
    }
  }

  /**
   * Dónde reaparecer: la plataforma ESTABLE más alta por debajo de `maxY`.
   *
   * Estable quiere decir que no se rompa, no se mueva y no lance. No es
   * quisquillosidad: reaparecer sobre un muelle disparaba al jugador 58
   * unidades hacia arriba, y como esa altura no venía de trepar, inflaba su
   * puntuación. En una partida de prueba, un jugador que no tocó un solo botón
   * acabó con 48 puntos por eso. Y reaparecer sobre una móvil deja al jugador
   * en el aire, porque para cuando se le coloca la plataforma ya no está ahí.
   */
  function respawnSpot(maxY: number): { x: number; y: number } {
    let best: Platform | null = null;
    for (const platform of platforms) {
      if (platform.gone) continue;
      if (platform.kind !== "solid" && platform.kind !== "ice") continue;
      if (platform.y > maxY) continue;
      if (!best || platform.y > best.y) best = platform;
    }
    if (!best) return { x: WORLD_W / 2, y: state.cameraY + 12 };
    return { x: best.x + best.w / 2, y: best.y };
  }

  function step(player: TowerPlayer, dtS: number): void {
    if (player.out) return;
    const pad = padFor(player.id);

    // --- Entrada ---------------------------------------------------------
    const dir = (isHeld(pad, "right") ? 1 : 0) - (isHeld(pad, "left") ? 1 : 0);
    if (takePress(pad, "jump")) jumpBufferedAt.set(player.id, now);
    const holdingJump = isHeld(pad, "jump");
    const wasHoldingJump = jumpHeld.get(player.id) ?? false;
    jumpHeld.set(player.id, holdingJump);

    // --- Horizontal ------------------------------------------------------
    const control = player.grounded ? 1 : AIR_CONTROL;
    if (dir !== 0) {
      player.vx += dir * MOVE_ACCEL * control * dtS;
      player.facing = dir > 0 ? 1 : -1;
    } else if (player.grounded) {
      const friction = standingOnIce(player) ? ICE_FRICTION : GROUND_FRICTION;
      player.vx -= player.vx * Math.min(1, friction * dtS);
    }
    player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);

    const prevFeet = player.y;
    player.x = clamp(player.x + player.vx * dtS, PLAYER_W / 2, WORLD_W - PLAYER_W / 2);
    if (player.x <= PLAYER_W / 2 || player.x >= WORLD_W - PLAYER_W / 2) player.vx = 0;

    // --- Vertical --------------------------------------------------------
    player.vy = Math.max(-MAX_FALL_SPEED, player.vy - GRAVITY * dtS);
    player.y += player.vy * dtS;

    const wasGrounded = player.grounded;
    player.grounded = false;
    landOnPlatforms(player, prevFeet);
    landOnHeads(player, prevFeet);

    if (wasGrounded && !player.grounded) leftGroundAt.set(player.id, now);

    // --- Salto -----------------------------------------------------------
    const buffered = jumpBufferedAt.get(player.id) ?? -Infinity;
    const canCoyote = now - (leftGroundAt.get(player.id) ?? -Infinity) <= COYOTE_MS;
    if (now - buffered <= JUMP_BUFFER_MS && (player.grounded || canCoyote)) {
      player.vy = JUMP_VELOCITY;
      player.grounded = false;
      player.jumpedAt = now;
      jumpBufferedAt.delete(player.id);
      leftGroundAt.set(player.id, -Infinity);
    }

    // Altura variable: soltar antes corta el impulso que quede hacia arriba.
    if (wasHoldingJump && !holdingJump && player.vy > 0) {
      player.vy *= JUMP_CUT;
    }

    if (player.y > player.best) player.best = player.y;
  }

  function standingOnIce(player: TowerPlayer): boolean {
    for (const platform of platforms) {
      if (platform.kind !== "ice" || platform.gone) continue;
      if (Math.abs(player.y - platform.y) > 0.5) continue;
      if (
        player.x >= platform.x - PLAYER_W / 2 &&
        player.x <= platform.x + platform.w + PLAYER_W / 2
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Plataformas atravesables por abajo: solo frenan CAYENDO y solo si los pies
   * venían de estar por encima. Es lo que permite subir la torre sin tener que
   * rodear cada plataforma, y es la diferencia entre un juego de trepar y uno
   * de esquivar techos.
   */
  function landOnPlatforms(player: TowerPlayer, prevFeet: number): void {
    if (player.vy > 0) return;
    for (const platform of platforms) {
      if (platform.gone) continue;
      const top = platform.y;
      if (prevFeet < top - 0.01 || player.y > top) continue;
      if (
        player.x < platform.x - PLAYER_W / 2 ||
        player.x > platform.x + platform.w + PLAYER_W / 2
      ) {
        continue;
      }

      player.y = top;
      player.grounded = true;

      if (platform.kind === "spring") {
        player.vy = SPRING_VELOCITY;
        player.grounded = false;
        platform.bouncedAt = now;
      } else {
        player.vy = 0;
        if (platform.kind === "crumble" && platform.breakAt == null) {
          platform.breakAt = now + CRUMBLE_MS;
        }
        if (platform.kind === "moving") {
          // Arrastrar al jugador con la plataforma. Sin esto, quedarse quieto
          // sobre una plataforma móvil la deja deslizarse bajo los pies, que es
          // lo contrario de lo que ve el jugador.
          player.x = clamp(
            player.x + (platform.dx ?? 0),
            PLAYER_W / 2,
            WORLD_W - PLAYER_W / 2
          );
        }
      }
      return;
    }
  }

  /**
   * Pisar la cabeza de otro jugador: quien cae rebota y quien recibe se lleva
   * un empujón hacia abajo. Es el único contacto directo del juego y está
   * medido a propósito: da un momento de "te la devuelvo" sin convertir la
   * partida en pelearse en vez de trepar.
   */
  function landOnHeads(player: TowerPlayer, prevFeet: number): void {
    if (player.vy > 0) return;
    for (const other of state.players) {
      if (other.id === player.id || other.out) continue;
      if (now < other.invulnerableUntil) continue;
      const head = other.y + PLAYER_H;
      if (prevFeet < head - 0.01 || player.y > head) continue;
      if (Math.abs(player.x - other.x) > PLAYER_W) continue;

      player.y = head;
      player.vy = STOMP_BOUNCE;
      player.grounded = false;
      other.vy = Math.min(other.vy, STOMP_PUSH);
      other.hurtAt = now;
      return;
    }
  }

  function loseLife(player: TowerPlayer): void {
    player.lives -= 1;
    player.hurtAt = now;
    if (player.lives <= 0) {
      player.out = true;
      return;
    }
    const spot = respawnSpot(state.cameraY + VIEW_H * 0.45);
    player.liftedByRespawn += Math.max(0, spot.y - player.y);
    player.x = spot.x;
    player.y = spot.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.invulnerableUntil = now + RESPAWN_INVULNERABLE_MS;
  }

  function updateCamera(dtS: number): void {
    const alive = state.players.filter((p) => !p.out);
    state.riseSpeed = RISE_BASE + (state.elapsedMs / 1000) * RISE_RAMP_PER_S;

    let target = state.cameraY + state.riseSpeed * dtS;
    if (alive.length > 0) {
      const leader = Math.max(...alive.map((p) => p.y));
      const chase = Math.min(leader - CAMERA_LEAD, state.cameraY + CAMERA_CATCH_UP * dtS);
      target = Math.max(target, chase);
      // Nunca comerse al que va primero. Si el líder se cae, la cámara
      // simplemente se queda quieta (no baja) y entonces sí está en apuros.
      target = Math.min(target, leader - CAMERA_MIN_LEAD);
    }
    // La cámara nunca baja: es lo que convierte la altura en algo ganado.
    state.cameraY = Math.max(state.cameraY, target);
  }

  function prunePlatforms(): void {
    const floor = state.cameraY - PRUNE_BELOW;
    for (let i = platforms.length - 1; i >= 0; i--) {
      if (platforms[i].y < floor) platforms.splice(i, 1);
    }
  }

  return {
    getState: () => state,

    start: () => emit(),

    handleInput: (playerId, input) => {
      if (state.phase !== "climbing") return;
      applyPadInput(padFor(playerId), input);
    },

    tick: (dtMs) => {
      if (state.phase !== "climbing") return;
      // Un paso de simulación acotado: si la pestaña del monitor se queda sin
      // pintar un momento, `dt` llega enorme y sin tope los jugadores
      // atravesarían las plataformas de un solo salto de integración.
      const dtS = Math.min(dtMs, 50) / 1000;
      now += dtS * 1000;
      state.elapsedMs += dtMs;

      for (const platform of platforms) {
        if (platform.breakAt != null && !platform.gone && now >= platform.breakAt) {
          platform.gone = true;
          platform.restoreAt = now + CRUMBLE_RESPAWN_MS;
        } else if (platform.gone && platform.restoreAt != null && now >= platform.restoreAt) {
          platform.gone = false;
          platform.breakAt = null;
          platform.restoreAt = null;
        }
      }
      movePlatforms();

      for (const player of state.players) step(player, dtS);
      for (const pad of pads.values()) clearPresses(pad);

      updateCamera(dtS);

      for (const player of state.players) {
        if (player.out) continue;
        if (player.y < state.cameraY - DEATH_MARGIN) loseLife(player);
      }

      generateTo(state.cameraY + GENERATE_AHEAD);
      prunePlatforms();

      const anyoneLeft = state.players.some((p) => !p.out);
      if (!anyoneLeft || state.elapsedMs >= durationMs) {
        state.phase = "gameover";
      }
      emit();
    },

    isFinished: () => state.phase === "gameover",

    getResult: (): GameResult => {
      const score = (p: TowerPlayer) => Math.max(0, Math.round(p.best - p.liftedByRespawn));
      const ranking = [...state.players].sort((a, b) => score(b) - score(a));
      return {
        ranking: ranking.map((p) => p.id),
        scores: Object.fromEntries(state.players.map((p) => [p.id, score(p)])),
        winnerId: ranking[0]?.id ?? null,
      };
    },

    cleanup: () => {
      pads.clear();
      jumpBufferedAt.clear();
      leftGroundAt.clear();
      jumpHeld.clear();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Lo exporta el monitor para dibujar los cuerpos con el mismo tamaño. */
export const TOWER_PLAYER_W = PLAYER_W;
export const TOWER_PLAYER_H = PLAYER_H;
