import type { GameDefinition } from "@/games/types";
import { createBalanceMazeEngine, type BalanceInput } from "@/games/balance-maze/logic";
import { BalanceMazeMonitorView } from "@/games/balance-maze/MonitorView";
import { BalanceMazePlayerView } from "@/games/balance-maze/PlayerView";
import { BalanceMazeThumbnail } from "@/games/balance-maze/Thumbnail";

export const balanceMazeDefinition: GameDefinition<BalanceInput> = {
  id: "balance-maze",
  name: "Laberinto de equilibrio",
  shortDescription: "Inclina el teléfono para guiar la bola hasta la meta",
  minPlayers: 1,
  maxPlayers: 4,
  requiredSensors: ["orientation", "gyroscope"],
  needsCalibration: true,
  Thumbnail: BalanceMazeThumbnail,
  MonitorComponent: BalanceMazeMonitorView,
  PlayerComponent: BalanceMazePlayerView,
  createEngine: createBalanceMazeEngine,
};
