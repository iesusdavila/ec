import type { ComponentType } from "react";
import type { GameResult, Player, SensorType } from "@/core/types";
import type { ClockEcho } from "@/core/realtime/clockSync";

export interface GameMonitorProps<TState> {
  state: TState | null;
  players: Player[];
}

export interface GamePlayerProps<TInput> {
  myId: string;
  players: Player[];
  /** Estado público del juego, recibido en tiempo real desde el host. */
  gameState: unknown;
  /**
   * Identidad estable durante toda la partida: se puede guardar en un ref y
   * llamarla desde un bucle sin volver a crearlo en cada render.
   */
  sendInput: (input: TInput) => void;
  /**
   * Dato para que el host mida la latencia real de este teléfono. Los juegos
   * con puntería deben adjuntarlo a sus entradas continuas; el resto puede
   * ignorarlo. Ver `core/realtime/clockSync.ts`.
   */
  getClockEcho: () => ClockEcho | null;
}

/** Contexto de red de una entrada, medido por el host. */
export interface InputMeta {
  /**
   * Latencia estimada de un sentido (teléfono → monitor) en ms para ESTE
   * jugador, medida sobre mensajes reales. Los juegos con puntería la usan
   * para evaluar el gesto contra lo que el jugador veía cuando lo hizo, no
   * contra lo que hay en pantalla ahora. Ver `core/realtime/clockSync.ts`.
   */
  latencyMs: number;
}

export interface GameEngine<TInput = unknown> {
  getState: () => unknown;
  start: () => void;
  handleInput: (playerId: string, input: TInput, meta: InputMeta) => void;
  /** Paso de simulación; los juegos por turnos pueden dejarlo vacío. */
  tick: (dtMs: number) => void;
  isFinished: () => boolean;
  getResult: () => GameResult;
  /** Libera timers internos del motor. No confundir con limpieza de sensores. */
  cleanup: () => void;
}

/**
 * Rango configurable por el host antes de iniciar. La mayoría de juegos usa
 * segundos (duración de la ronda); Dardos usa "throws" (tiros por jugador) y
 * Simón usa "lives" (errores permitidos antes de eliminar), porque ninguno
 * de los dos tiene un reloj: son de turnos/eliminación.
 */
export interface DurationConfig {
  min: number;
  max: number;
  default: number;
  step: number;
  unit: "seconds" | "throws" | "lives";
}

export interface GameLaunchOptions {
  /** Segundos o tiros según GameDefinition.duration?.unit. */
  roundValue: number;
  /** Solo relevante si GameDefinition.supportsSplitScreen es true. */
  splitScreen: boolean;
}

export interface GameEngineContext {
  players: Player[];
  options: GameLaunchOptions;
  /** El motor debe llamar esto cada vez que su estado cambie. */
  onStateChange: (state: unknown) => void;
}

export interface GameDefinition<TInput = unknown> {
  id: string;
  name: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  requiredSensors: SensorType[];
  /** Si el juego usa inclinación, conviene calibrar antes de empezar. */
  needsCalibration: boolean;
  /**
   * El mando no apunta girando, sino MOVIÉNDOSE por el espacio: el jugador
   * arrastra el teléfono a su alrededor y el cursor lo sigue.
   *
   * Activa el rastreo de `core/sensors/tracking/`, que necesita la cámara y por
   * tanto un gesto del usuario para arrancar (lo da la pantalla de
   * calibración). Si el teléfono no puede rastrear posición, el juego debe
   * seguir siendo jugable con la inclinación de siempre: esto es una mejora,
   * no un requisito.
   */
  needsPositionTracking?: boolean;
  /** Si se define, el host puede elegir la duración de la ronda antes de iniciar. */
  duration?: DurationConfig;
  /** Si el juego puede jugarse en pantalla dividida (una sub-partida por jugador). */
  supportsSplitScreen?: boolean;
  /**
   * Recorta el estado que se transmite a los TELÉFONOS. Por defecto viaja el
   * estado completo, que es lo que necesitan los juegos cuya pantalla de
   * jugador dibuja la partida (Dardos, Simón, Cubo…).
   *
   * Los juegos donde el teléfono es solo un mando —Corta frutas— deben recortar
   * aquí: el snapshot completo lleva la posición de cada fruta y se emite ~9
   * veces por segundo, y un teléfono que recibe, parsea y re-renderiza todo eso
   * tiene menos CPU para lo único que importa, que es mandar la puntería a
   * tiempo. Devolver un objeto pequeño y ESTABLE también evita reenvíos: el
   * host no retransmite si la proyección no cambió.
   */
  toPlayerState?: (state: unknown) => unknown;
  Thumbnail: ComponentType<{ className?: string }>;
  MonitorComponent: ComponentType<GameMonitorProps<unknown>>;
  PlayerComponent: ComponentType<GamePlayerProps<TInput>>;
  createEngine: (context: GameEngineContext) => GameEngine<TInput>;
}
