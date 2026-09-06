import type { GameDefinition } from "@/games/types";
import { createDartsEngine, type DartsInput } from "@/games/darts/logic";
import { DartsMonitorView } from "@/games/darts/MonitorView";
import { DartsPlayerView } from "@/games/darts/PlayerView";
import { DartsThumbnail } from "@/games/darts/Thumbnail";

export const dartsDefinition: GameDefinition<DartsInput> = {
  id: "darts",
  name: "Dardos",
  shortDescription: "Mantén presionado, apunta inclinando y suelta para lanzar",
  minPlayers: 1,
  maxPlayers: 5,
  requiredSensors: ["orientation"],
  needsCalibration: true,
  duration: { min: 3, max: 9, default: 3, step: 2, unit: "throws" },
  Thumbnail: DartsThumbnail,
  MonitorComponent: DartsMonitorView,
  PlayerComponent: DartsPlayerView,
  createEngine: createDartsEngine,
};
