import type { GameDefinition } from "@/games/types";
import { createDartsEngine, type DartsInput } from "@/games/darts/logic";
import { DartsMonitorView } from "@/games/darts/MonitorView";
import { DartsPlayerView } from "@/games/darts/PlayerView";
import { DartsThumbnail } from "@/games/darts/Thumbnail";

export const dartsDefinition: GameDefinition<DartsInput> = {
  id: "darts",
  name: "Dardos",
  shortDescription: "Apunta inclinando el teléfono y lanza con un gesto",
  minPlayers: 1,
  maxPlayers: 5,
  requiredSensors: ["orientation", "motion"],
  needsCalibration: true,
  Thumbnail: DartsThumbnail,
  MonitorComponent: DartsMonitorView,
  PlayerComponent: DartsPlayerView,
  createEngine: createDartsEngine,
};
