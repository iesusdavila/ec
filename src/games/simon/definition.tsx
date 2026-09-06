import type { GameDefinition } from "@/games/types";
import { createSimonEngine, type Direction } from "@/games/simon/logic";
import { SimonMonitorView } from "@/games/simon/MonitorView";
import { SimonPlayerView } from "@/games/simon/PlayerView";
import { SimonThumbnail } from "@/games/simon/Thumbnail";

export const simonDefinition: GameDefinition<Direction> = {
  id: "simon",
  name: "Simón dice",
  shortDescription: "Repite la secuencia tocando las 8 direcciones",
  minPlayers: 1,
  maxPlayers: 5,
  requiredSensors: [],
  needsCalibration: false,
  duration: { min: 1, max: 5, default: 2, step: 1, unit: "lives" },
  Thumbnail: SimonThumbnail,
  MonitorComponent: SimonMonitorView,
  PlayerComponent: SimonPlayerView,
  createEngine: createSimonEngine,
};
