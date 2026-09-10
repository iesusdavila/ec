import type { GameDefinition } from "@/games/types";
import { bombArenaToPlayerState, createBombArenaEngine } from "@/games/bomb-arena/logic";
import type { PadInput } from "@/games/runtime/padInput";
import { BombArenaMonitorView } from "@/games/bomb-arena/MonitorView";
import { BombArenaPlayerView } from "@/games/bomb-arena/PlayerView";
import { BombArenaThumbnail } from "@/games/bomb-arena/Thumbnail";

export const bombArenaDefinition: GameDefinition<PadInput> = {
  id: "bomb-arena",
  name: "Pólvora",
  shortDescription: "Rompe bloques, recoge mejoras y deja al resto sin salida antes de que se cierre la arena",
  // Hacen falta dos: la gracia es dejar sin salida a alguien.
  minPlayers: 2,
  maxPlayers: 4,
  requiredSensors: [],
  needsCalibration: false,
  duration: { min: 60, max: 180, default: 120, step: 30, unit: "seconds" },
  toPlayerState: bombArenaToPlayerState,
  Thumbnail: BombArenaThumbnail,
  MonitorComponent: BombArenaMonitorView,
  PlayerComponent: BombArenaPlayerView,
  createEngine: createBombArenaEngine,
};
