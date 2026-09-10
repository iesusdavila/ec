/**
 * Punto único de registro de juegos. Importar este módulo (en vez de
 * `registry` directamente) garantiza que todos los juegos queden
 * registrados antes de usarse.
 */
import { registerGame, getGame, listGames } from "@/games/registry";
import { simonDefinition } from "@/games/simon/definition";
import { fruitSliceDefinition } from "@/games/fruit-slice/definition";
import { dartsDefinition } from "@/games/darts/definition";
import { raceDefinition } from "@/games/race/definition";
import { balanceMazeDefinition } from "@/games/balance-maze/definition";
import { cube3dDefinition } from "@/games/cube3d/definition";
import { towerClimbDefinition } from "@/games/tower-climb/definition";
import { bombArenaDefinition } from "@/games/bomb-arena/definition";

registerGame(simonDefinition);
registerGame(fruitSliceDefinition);
registerGame(dartsDefinition);
registerGame(raceDefinition);
registerGame(balanceMazeDefinition);
registerGame(towerClimbDefinition);
registerGame(bombArenaDefinition);
registerGame(cube3dDefinition);

export { getGame, listGames };
