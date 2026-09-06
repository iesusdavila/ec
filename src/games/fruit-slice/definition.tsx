import type { GameDefinition } from "@/games/types";
import { createFruitSliceEngine, type FruitSliceInput } from "@/games/fruit-slice/logic";
import { FruitSliceMonitorView } from "@/games/fruit-slice/MonitorView";
import { FruitSlicePlayerView } from "@/games/fruit-slice/PlayerView";
import { FruitSliceThumbnail } from "@/games/fruit-slice/Thumbnail";

export const fruitSliceDefinition: GameDefinition<FruitSliceInput> = {
  id: "fruit-slice",
  name: "Corta frutas",
  shortDescription: "Apunta con el teléfono como un puntero y corta las frutas, evita las bombas",
  minPlayers: 1,
  maxPlayers: 3,
  // Ahora el control es de puntería (inclinación), no de agitar: necesita
  // orientación y una calibración previa que fije el punto neutro = centro.
  requiredSensors: ["orientation"],
  needsCalibration: true,
  duration: { min: 30, max: 120, default: 45, step: 15, unit: "seconds" },
  supportsSplitScreen: true,
  Thumbnail: FruitSliceThumbnail,
  MonitorComponent: FruitSliceMonitorView,
  PlayerComponent: FruitSlicePlayerView,
  createEngine: createFruitSliceEngine,
};
