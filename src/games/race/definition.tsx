import type { GameDefinition } from "@/games/types";
import { createRaceEngine, type RaceInput } from "@/games/race/logic";
import { RaceMonitorView } from "@/games/race/MonitorView";
import { RacePlayerView } from "@/games/race/PlayerView";
import { RaceThumbnail } from "@/games/race/Thumbnail";

export const raceDefinition: GameDefinition<RaceInput> = {
  id: "race",
  name: "Carrera",
  shortDescription: "Agita para avanzar, inclina para esquivar obstáculos",
  minPlayers: 2,
  maxPlayers: 5,
  requiredSensors: ["motion", "orientation"],
  needsCalibration: true,
  Thumbnail: RaceThumbnail,
  MonitorComponent: RaceMonitorView,
  PlayerComponent: RacePlayerView,
  createEngine: createRaceEngine,
};
