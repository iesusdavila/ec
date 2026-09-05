import type { GameDefinition } from "@/games/types";
import { createFruitSliceEngine } from "@/games/fruit-slice/logic";
import { FruitSliceMonitorView } from "@/games/fruit-slice/MonitorView";
import { FruitSlicePlayerView } from "@/games/fruit-slice/PlayerView";
import { FruitSliceThumbnail } from "@/games/fruit-slice/Thumbnail";

export const fruitSliceDefinition: GameDefinition<Record<string, never>> = {
  id: "fruit-slice",
  name: "Corta frutas",
  shortDescription: "Agita el teléfono para cortar frutas, evita las bombas",
  minPlayers: 1,
  maxPlayers: 3,
  requiredSensors: ["motion"],
  needsCalibration: false,
  Thumbnail: FruitSliceThumbnail,
  MonitorComponent: FruitSliceMonitorView,
  PlayerComponent: FruitSlicePlayerView,
  createEngine: createFruitSliceEngine,
};
