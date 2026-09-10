import type { GameDefinition } from "@/games/types";
import {
  createFruitSliceEngine,
  fruitSliceToPlayerState,
  type FruitSliceInput,
} from "@/games/fruit-slice/logic";
import { FruitSliceMonitorView } from "@/games/fruit-slice/MonitorView";
import { FruitSlicePlayerView } from "@/games/fruit-slice/PlayerView";
import { FruitSliceThumbnail } from "@/games/fruit-slice/Thumbnail";

export const fruitSliceDefinition: GameDefinition<FruitSliceInput> = {
  id: "fruit-slice",
  name: "Corta frutas",
  shortDescription: "Mueve el teléfono por el aire para llevar el cursor y corta las frutas, evita las bombas",
  minPlayers: 1,
  maxPlayers: 3,
  // El control es de puntería. La forma buena es rastreando la POSICIÓN del
  // teléfono (mover el aparato por el espacio arrastra el cursor); la
  // inclinación queda como plan B para teléfonos que no puedan rastrear, y por
  // eso se siguen pidiendo orientación y calibración.
  requiredSensors: ["orientation", "gyroscope"],
  needsCalibration: true,
  needsPositionTracking: true,
  duration: { min: 30, max: 120, default: 45, step: 15, unit: "seconds" },
  supportsSplitScreen: true,
  // El teléfono es solo un mando: no necesita el estado completo y recibirlo le
  // quitaba CPU para enviar la puntería a tiempo. Ver fruitSliceToPlayerState.
  toPlayerState: fruitSliceToPlayerState,
  Thumbnail: FruitSliceThumbnail,
  MonitorComponent: FruitSliceMonitorView,
  PlayerComponent: FruitSlicePlayerView,
  createEngine: createFruitSliceEngine,
};
