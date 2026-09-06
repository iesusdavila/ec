import type { GameDefinition } from "@/games/types";
import { createCube3dEngine, type Cube3dInput } from "@/games/cube3d/logic";
import { Cube3dMonitorView } from "@/games/cube3d/MonitorView";
import { Cube3dPlayerView } from "@/games/cube3d/PlayerView";
import { Cube3dThumbnail } from "@/games/cube3d/Thumbnail";

export const cube3dDefinition: GameDefinition<Cube3dInput> = {
  id: "cube3d",
  name: "Cubo 3D (experimental)",
  shortDescription: "Experimento 3D: inclina el teléfono para llegar a la meta",
  minPlayers: 1,
  maxPlayers: 2,
  requiredSensors: ["orientation"],
  needsCalibration: true,
  duration: { min: 20, max: 90, default: 30, step: 10, unit: "seconds" },
  Thumbnail: Cube3dThumbnail,
  MonitorComponent: Cube3dMonitorView,
  PlayerComponent: Cube3dPlayerView,
  createEngine: createCube3dEngine,
};
