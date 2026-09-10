/**
 * Arnés de verificación de Pólvora (arena de bombas).
 *
 *     node --import ./docs/alias-loader.mjs --experimental-strip-types docs/verificacion-polvora.ts
 *
 * Igual que en Torre infinita, lo primero son las propiedades ESTRUCTURALES,
 * que se comprueban sin depender de que nadie juegue bien: que nadie empiece
 * encerrado y que la arena esté conectada. Un mapa donde dos jugadores no
 * pueden encontrarse nunca produce una partida que simplemente no pasa nada, y
 * eso saldría en la tercera o cuarta partida, no en la primera.
 *
 * Después, las reglas: alcance del fuego, cadenas, la regla de poder salir de
 * tu propia bomba, mejoras y muerte súbita. Son reglas de las que todo el mundo
 * cree acordarse y que es facilísimo implementar mal en un detalle.
 */

import {
  createBombArenaEngine,
  GRID_H,
  GRID_W,
  type BombArenaState,
} from "@/games/bomb-arena/logic";
import type { PadInput } from "@/games/runtime/padInput";
import type { GameEngine, GameEngineContext } from "@/games/types";

const FRAME_MS = 1000 / 60;

function makeEngine(ids: string[], seconds = 120): {
  engine: GameEngine<PadInput>;
  state: () => BombArenaState;
} {
  let latest: BombArenaState | null = null;
  const context: GameEngineContext = {
    players: ids.map((id, i) => ({ id, name: id, color: "#fff", joinedAt: i })),
    options: { roundValue: seconds, splitScreen: false },
    onStateChange: (next) => {
      latest = next as BombArenaState;
    },
  };
  const engine = createBombArenaEngine(context);
  engine.start();
  return { engine, state: () => latest as BombArenaState };
}

const send = (e: GameEngine<PadInput>, id: string, h: string[], p: string[] = []) =>
  e.handleInput(id, { h, p }, { latencyMs: 0 });

const at = (s: BombArenaState, cx: number, cy: number) => s.grid[cy * GRID_W + cx];
const setCell = (s: BombArenaState, cx: number, cy: number, v: "empty" | "wall" | "brick") => {
  s.grid[cy * GRID_W + cx] = v;
};
/** Deja la arena limpia de bloques rompibles, para escenarios controlados. */
function clearBricks(s: BombArenaState): void {
  for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === "brick") s.grid[i] = "empty";
}

function advance(engine: GameEngine<PadInput>, ms: number, each?: () => void): void {
  const steps = Math.round(ms / FRAME_MS);
  for (let i = 0; i < steps; i++) {
    each?.();
    engine.tick(FRAME_MS);
  }
}

let failures = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASA " : "FALLA"}  ${name.padEnd(54)} ${extra}`);
}

// --- 1. La arena ----------------------------------------------------------
console.log("\n1) La arena generada");
{
  let encerrados = 0;
  let desconectadas = 0;
  const arenas = 60;

  for (let ronda = 0; ronda < arenas; ronda++) {
    const { state } = makeEngine(["a", "b", "c", "d"]);
    const s = state();

    // Nadie puede empezar sin al menos una salida libre.
    for (const p of s.players) {
      const salidas = [
        [p.cx + 1, p.cy],
        [p.cx - 1, p.cy],
        [p.cx, p.cy + 1],
        [p.cx, p.cy - 1],
      ].filter(([cx, cy]) => at(s, cx, cy) === "empty");
      if (salidas.length === 0) encerrados++;
    }

    // Conectividad rompiendo bloques: desde la primera salida hay que poder
    // llegar a todas las demás. Si no, hay jugadores que no se encuentran
    // jamás y la partida se decide por el reloj sin que ocurra nada.
    const visto = new Set<number>();
    const cola = [[s.players[0].cx, s.players[0].cy]];
    visto.add(s.players[0].cy * GRID_W + s.players[0].cx);
    while (cola.length > 0) {
      const [cx, cy] = cola.pop()!;
      for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const key = ny * GRID_W + nx;
        if (visto.has(key) || at(s, nx, ny) === "wall") continue;
        visto.add(key);
        cola.push([nx, ny]);
      }
    }
    if (s.players.some((p) => !visto.has(p.cy * GRID_W + p.cx))) desconectadas++;
  }

  check("nadie empieza encerrado", encerrados === 0, `${encerrados} casos en ${arenas} arenas`);
  check("la arena siempre está conectada", desconectadas === 0, `${desconectadas} de ${arenas}`);
}

// --- 2. Movimiento --------------------------------------------------------
console.log("\n2) Movimiento por casillas");
{
  const { engine, state } = makeEngine(["a"]);
  clearBricks(state());
  const me = () => state().players[0];
  const inicio = { cx: me().cx, cy: me().cy };

  advance(engine, 600, () => send(engine, "a", ["right"]));
  check("moverse a una casilla libre funciona", me().cx > inicio.cx, `cx ${inicio.cx} -> ${me().cx}`);
  // Soltar y dejar que termine el paso en curso: mientras se mantiene el botón
  // el jugador encadena pasos sin parar, que es justo lo que se quiere.
  send(engine, "a", []);
  advance(engine, 600, () => send(engine, "a", []));
  check("al soltar se queda alineado a la rejilla",
    Number.isInteger(me().cx) && me().progress === 0, `progress=${me().progress}`);
}
{
  const { engine, state } = makeEngine(["a"]);
  const s = state();
  clearBricks(s);
  // Muro justo a la derecha de la salida.
  setCell(s, s.players[0].cx + 1, s.players[0].cy, "wall");
  const antes = s.players[0].cx;
  advance(engine, 700, () => send(engine, "a", ["right"]));
  check("no se atraviesan los muros", state().players[0].cx === antes);
}
{
  const { engine, state } = makeEngine(["a"]);
  const s = state();
  clearBricks(s);
  setCell(s, s.players[0].cx + 1, s.players[0].cy, "brick");
  const antes = s.players[0].cx;
  advance(engine, 700, () => send(engine, "a", ["right"]));
  check("no se atraviesan los bloques", state().players[0].cx === antes);
}

// --- 3. Bombas ------------------------------------------------------------
console.log("\n3) Bombas, fuego y cadenas");
{
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  // OJO: hay que copiar las coordenadas, no quedarse con el objeto jugador.
  // Es un objeto vivo y `p.cx` cambia en cuanto se mueve, así que comprobar
  // luego "el bloque en p.cx + 3" miraría una casilla distinta de la que se
  // preparó. Esta prueba falló exactamente por eso.
  const bomba = { cx: s.players[0].cx, cy: s.players[0].cy };
  // Bloque a tres casillas: fuera del alcance inicial (2).
  setCell(s, bomba.cx + 3, bomba.cy, "brick");
  setCell(s, bomba.cx + 2, bomba.cy, "empty");

  send(engine, "a", [], ["bomb"]);
  engine.tick(FRAME_MS);
  check("poner una bomba la deja en el tablero", state().bombs.length === 1);

  // Salir de la zona de peligro antes de que reviente.
  advance(engine, 900, () => send(engine, "a", ["down"]));
  advance(engine, 900, () => send(engine, "a", ["down"]));
  advance(engine, 1200, () => send(engine, "a", []));

  const despues = state();
  check("la bomba explota sola", despues.bombs.length === 0);
  check("el fuego no llega más lejos que su alcance",
    at(despues, bomba.cx + 3, bomba.cy) === "brick", "el bloque a 3 casillas sigue en pie");
  check("el jugador que se apartó sigue vivo", despues.players[0].alive);
}
{
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const bomba = { cx: s.players[0].cx, cy: s.players[0].cy };
  setCell(s, bomba.cx + 2, bomba.cy, "brick");
  send(engine, "a", [], ["bomb"]);
  engine.tick(FRAME_MS);
  advance(engine, 900, () => send(engine, "a", ["down"]));
  advance(engine, 2400, () => send(engine, "a", []));
  check("el fuego rompe el bloque que tiene a su alcance",
    at(state(), bomba.cx + 2, bomba.cy) === "empty");
}
{
  // El fuego se para en el PRIMER bloque de cada brazo.
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const bomba = { cx: s.players[0].cx, cy: s.players[0].cy };
  s.players[0].range = 5;
  setCell(s, bomba.cx + 1, bomba.cy, "brick");
  setCell(s, bomba.cx + 2, bomba.cy, "brick");
  send(engine, "a", [], ["bomb"]);
  engine.tick(FRAME_MS);
  advance(engine, 900, () => send(engine, "a", ["down"]));
  advance(engine, 2400, () => send(engine, "a", []));
  const d = state();
  check("el fuego se detiene en el primer bloque de cada brazo",
    at(d, bomba.cx + 1, bomba.cy) === "empty" && at(d, bomba.cx + 2, bomba.cy) === "brick");
}
{
  // Cadena: una bomba enciende a otra antes de que a esa le toque su turno.
  // Se montan las dos a mano en el estado, con mechas muy distintas, porque
  // coreografiar a dos jugadores para conseguirlo hacía la prueba frágil sin
  // comprobar nada más.
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const cx = s.players[0].cx;
  const cy = s.players[0].cy;
  // El jugador se aparta para que no lo mate su propia prueba.
  s.players[0].cx = cx;
  s.players[0].cy = cy + 3;
  s.players[0].tx = cx;
  s.players[0].ty = cy + 3;
  s.bombs.push({ id: 900, cx, cy, ownerId: "a", range: 2, explodesAt: 100 });
  s.bombs.push({ id: 901, cx: cx + 1, cy, ownerId: "a", range: 2, explodesAt: 999999 });

  advance(engine, 300, () => send(engine, "a", []));
  check("una bomba enciende a la de al lado en cadena", state().bombs.length === 0,
    `quedan ${state().bombs.length}`);
}

{
  // Regla clásica: se sale de la propia bomba, pero no se vuelve a entrar.
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const origen = { cx: s.players[0].cx, cy: s.players[0].cy };
  send(engine, "a", [], ["bomb"]);
  engine.tick(FRAME_MS);
  advance(engine, 600, () => send(engine, "a", ["down"]));
  const salio = state().players[0].cy > origen.cy;
  advance(engine, 700, () => send(engine, "a", ["up"]));
  const volvio = state().players[0].cy === origen.cy;
  check("se puede salir de encima de la propia bomba", salio);
  check("pero no se puede volver a entrar", !volvio);
}
{
  // Quedarse en el fuego mata.
  const { engine, state } = makeEngine(["a"], 600);
  clearBricks(state());
  send(engine, "a", [], ["bomb"]);
  advance(engine, 3200, () => send(engine, "a", []));
  check("quedarse junto a la propia bomba mata", !state().players[0].alive);
}

// --- 4. Mejoras -----------------------------------------------------------
console.log("\n4) Mejoras");
{
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const p = s.players[0];
  s.powerups.push({ cx: p.cx, cy: p.cy + 1, kind: "fire" });
  const antes = p.range;
  advance(engine, 700, () => send(engine, "a", ["down"]));
  check("recoger una mejora la aplica", state().players[0].range === antes + 1,
    `alcance ${antes} -> ${state().players[0].range}`);
  check("y desaparece del suelo", state().powerups.length === 0);
}
{
  const { engine, state } = makeEngine(["a"], 600);
  const s = state();
  clearBricks(s);
  const p = s.players[0];
  s.powerups.push({ cx: p.cx, cy: p.cy + 1, kind: "speed" });
  send(engine, "a", [], ["bomb"]);
  advance(engine, 3000, () => send(engine, "a", []));
  check("el fuego destruye las mejoras que alcanza", state().powerups.length === 0);
}

// --- 5. Muerte súbita y final ---------------------------------------------
console.log("\n5) Muerte súbita y final de partida");
{
  const { engine, state } = makeEngine(["a", "b"], 30);
  clearBricks(state());
  const murosAntes = state().grid.filter((c) => c === "wall").length;
  for (let i = 0; i < 60 * 40 && !engine.isFinished(); i++) {
    send(engine, "a", []);
    send(engine, "b", []);
    engine.tick(FRAME_MS);
  }
  const s = state();
  check("la arena se cierra en muerte súbita",
    s.grid.filter((c) => c === "wall").length > murosAntes,
    `muros ${murosAntes} -> ${s.grid.filter((c) => c === "wall").length}`);
  check("la partida termina", engine.isFinished(),
    `elapsed=${(s.elapsedMs / 1000).toFixed(1)}s`);
  // La partida acaba en cuanto queda uno solo, así que NO mueren los dos: al
  // caer el primero se termina. Lo que se comprueba es que la espiral mata.
  check("la espiral acaba aplastando a quien no se mueve",
    s.players.some((p) => !p.alive), `vivos=${s.players.filter((p) => p.alive).length}`);
}
{
  const { engine, state } = makeEngine(["a", "b"], 600);
  clearBricks(state());
  state().players[1].alive = false;
  state().players[1].diedAt = 1;
  advance(engine, 100);
  check("con un solo superviviente la partida acaba", engine.isFinished());
  const result = engine.getResult();
  check("gana el que sobrevive", result.winnerId === "a", `ganador=${result.winnerId}`);
  check("hay puntuación de todos", Object.keys(result.scores).length === 2);
}

console.log(failures === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${failures} COMPROBACIONES FALLAN`);
process.exit(failures === 0 ? 0 : 1);
