import type { GameDefinition } from "@/games/types";
import { createSimonEngine, type Direction } from "@/games/simon/logic";
import { SimonMonitorView } from "@/games/simon/MonitorView";
import { SimonPlayerView } from "@/games/simon/PlayerView";
import { SimonThumbnail } from "@/games/simon/Thumbnail";

export const simonDefinition: GameDefinition<Direction> = {
  id: "simon",
  name: "Simón dice",
  shortDescription: "Repite la secuencia inclinando el teléfono",
  minPlayers: 1,
  maxPlayers: 5,
  requiredSensors: ["orientation"],
  needsCalibration: true,
  Thumbnail: SimonThumbnail,
  MonitorComponent: SimonMonitorView,
  PlayerComponent: SimonPlayerView,
  createEngine: createSimonEngine,
};
