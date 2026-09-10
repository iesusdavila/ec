import type { GameDefinition } from "@/games/types";
import { createTowerClimbEngine, towerToPlayerState } from "@/games/tower-climb/logic";
import type { PadInput } from "@/games/runtime/padInput";
import { TowerClimbMonitorView } from "@/games/tower-climb/MonitorView";
import { TowerClimbPlayerView } from "@/games/tower-climb/PlayerView";
import { TowerClimbThumbnail } from "@/games/tower-climb/Thumbnail";

export const towerClimbDefinition: GameDefinition<PadInput> = {
  id: "tower-climb",
  name: "Torre infinita",
  shortDescription: "Trepad la misma torre: la pantalla sube y quien se queda abajo, fuera",
  minPlayers: 1,
  maxPlayers: 4,
  // Mando de botones: ni sensores ni calibración. `jugador/page.tsx` se salta
  // la pantalla de permisos cuando `requiredSensors` está vacío.
  requiredSensors: [],
  needsCalibration: false,
  duration: { min: 45, max: 150, default: 90, step: 15, unit: "seconds" },
  // El teléfono es solo un mando: recibir la torre entera 9 veces por segundo
  // le quitaría CPU justo para lo único que tiene que hacer, que es mandar los
  // botones a tiempo. Ver la nota de `toPlayerState` en games/types.ts.
  toPlayerState: towerToPlayerState,
  Thumbnail: TowerClimbThumbnail,
  MonitorComponent: TowerClimbMonitorView,
  PlayerComponent: TowerClimbPlayerView,
  createEngine: createTowerClimbEngine,
};
