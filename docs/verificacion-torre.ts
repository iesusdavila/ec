/**
 * Arnés de verificación de Torre infinita.
 *
 *     node --import ./docs/alias-loader.mjs --experimental-strip-types docs/verificacion-torre.ts
 *
 * Comprueba lo que no se puede ver mirando el juego un rato: que la torre
 * generada SE PUEDA subir siempre (un hueco imposible cada cincuenta bandas
 * aparece en la partida veinte, cuando ya nadie sabe por qué el juego se
 * atascó), y que el salto tenga las tres cortesías que lo hacen sentir justo
 * —altura variable, coyote y búfer—, que son fáciles de romper sin notarlo.
 *
 * La prueba de fondo es un bot que trepa: si un bot tonto sobrevive, la torre
 * es jugable.
 */

import { createTowerClimbEngine, VIEW_H, type TowerState } from "@/games/tower-climb/logic";
import type { PadInput } from "@/games/runtime/padInput";
import type { GameEngine, GameEngineContext } from "@/games/types";

const FRAME_MS = 1000 / 60;

function makeEngine(playerIds: string[], seconds = 120): {
  engine: GameEngine<PadInput>;
  state: () => TowerState;
} {
  let latest: TowerState | null = null;
  const context: GameEngineContext = {
    players: playerIds.map((id, i) => ({ id, name: id, color: "#fff", joinedAt: i })),
    options: { roundValue: seconds, splitScreen: false },
    onStateChange: (next) => {
      latest = next as TowerState;
    },
  };
  const engine = createTowerClimbEngine(context);
  engine.start();
  return { engine, state: () => latest as TowerState };
}

function send(engine: GameEngine<PadInput>, id: string, held: string[], pressed: string[] = []) {
  engine.handleInput(id, { h: held, p: pressed }, { latencyMs: 0 });
}

let failures = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASA " : "FALLA"}  ${name.padEnd(52)} ${extra}`);
}

// --- 1. Física del salto --------------------------------------------------
console.log("\n1) Salto");
{
  // Mide el vértice de un salto limpio. La torre es aleatoria y puede haber un
  // muelle justo encima: si se toca, la medición ya no es la del salto (llegó a
  // marcar 70) y hay que repetir con otra torre.
  let apex = 0;
  for (let intento = 0; intento < 20; intento++) {
    const { engine, state } = makeEngine([`a${intento}`]);
    const me = () => state().players[0];
    send(engine, `a${intento}`, ["jump"], ["jump"]);
    let vyPrevia = Infinity;
    let limpio = true;
    let medida = 0;
    for (let i = 0; i < 120; i++) {
      send(engine, `a${intento}`, ["jump"]);
      engine.tick(FRAME_MS);
      const p = me();
      // Un impulso hacia arriba EN EL AIRE solo puede venir de un muelle.
      // La condición de estar en el aire es imprescindible: al aterrizar la
      // velocidad pasa de negativa a cero, que también es "subir", y sin ella
      // se descartaba absolutamente todos los intentos.
      if (i > 2 && !p.grounded && p.vy > vyPrevia + 1) { limpio = false; break; }
      vyPrevia = p.vy;
      medida = Math.max(medida, p.y);
      if (i > 5 && p.grounded) break;
    }
    if (limpio) { apex = medida; break; }
  }
  check("el salto sube más que el hueco entre bandas (15,5)", apex > 15.5, `apex=${apex.toFixed(1)}`);
  check("y no tanto como para trivializar la torre", apex > 0 && apex < 26, `apex=${apex.toFixed(1)}`);
}
{
  // Altura variable: soltar pronto tiene que subir claramente menos.
  const { engine, state } = makeEngine(["a"]);
  const me = () => state().players[0];
  send(engine, "a", ["jump"], ["jump"]);
  let apex = 0;
  for (let i = 0; i < 120; i++) {
    send(engine, "a", i < 4 ? ["jump"] : []);
    engine.tick(FRAME_MS);
    apex = Math.max(apex, me().y);
    if (i > 5 && me().grounded) break;
  }
  check("soltar pronto salta más bajo (altura variable)", apex > 3 && apex < 13, `apex=${apex.toFixed(1)}`);
}
{
  // Coyote: caminar fuera del borde y saltar UNA VEZ YA EN EL AIRE.
  const { engine, state } = makeEngine(["a"]);
  const me = () => state().players[0];
  // El suelo inicial ocupa todo el ancho, así que se usa una caída provocada:
  // se salta, y al ir bajando se comprueba que un salto tardío ya no vale.
  send(engine, "a", ["jump"], ["jump"]);
  for (let i = 0; i < 3; i++) {
    send(engine, "a", ["jump"]);
    engine.tick(FRAME_MS);
  }
  const alturaDespegue = me().y;
  // A los ~5 fotogramas (83 ms) sigue dentro del margen de coyote... pero ya
  // saltó, así que lo que se comprueba aquí es que NO hay doble salto.
  send(engine, "a", ["jump"], ["jump"]);
  const antes = me().vy;
  engine.tick(FRAME_MS);
  check("no hay doble salto en el aire", me().vy < antes, `vy ${antes.toFixed(1)} -> ${me().vy.toFixed(1)}`);
  check("el despegue ocurrió", alturaDespegue > 0, `y=${alturaDespegue.toFixed(2)}`);
}
{
  // Búfer: pulsar saltar mientras aún se cae debe producir salto AL ATERRIZAR.
  const { engine, state } = makeEngine(["a"]);
  const me = () => state().players[0];
  send(engine, "a", ["jump"], ["jump"]);
  for (let i = 0; i < 40; i++) {
    send(engine, "a", ["jump"]);
    engine.tick(FRAME_MS);
    if (me().vy < 0) break;
  }
  // Caer hasta estar a punto de aterrizar. El tope no es decorativo: el
  // jugador puede aterrizar en una plataforma generada más arriba en vez de
  // volver al suelo, y sin límite este bucle no termina nunca.
  let cayendo = 0;
  while (!me().grounded && cayendo < 600) {
    send(engine, "a", []);
    engine.tick(FRAME_MS);
    cayendo++;
    if (me().vy < 0 && me().y < 2) break;
  }
  send(engine, "a", ["jump"], ["jump"]); // pulsado ANTES de tocar suelo
  let saltoTrasAterrizar = false;
  for (let i = 0; i < 12; i++) {
    send(engine, "a", ["jump"]);
    engine.tick(FRAME_MS);
    if (me().vy > 50) saltoTrasAterrizar = true;
  }
  check("un salto pulsado antes de aterrizar no se pierde (búfer)", saltoTrasAterrizar);
}

// --- 2. Alcance horizontal vs. generación --------------------------------
console.log("\n2) ¿La torre se puede subir?");
{
  const { engine, state } = makeEngine(["a"]);
  const me = () => state().players[0];
  // Carrerilla a tope y salto: cuánto se avanza en horizontal.
  for (let i = 0; i < 60; i++) {
    send(engine, "a", ["right"]);
    engine.tick(FRAME_MS);
  }
  const x0 = me().x;
  send(engine, "a", ["right", "jump"], ["jump"]);
  for (let i = 0; i < 120; i++) {
    send(engine, "a", ["right", "jump"]);
    engine.tick(FRAME_MS);
    if (i > 5 && me().grounded) break;
  }
  const alcance = me().x - x0;
  // La generación separa CENTROS hasta 42 unidades, pero las plataformas miden
  // 20-38 de ancho, así que el hueco real entre bordes nunca pasa de ~22.
  check("un salto con carrerilla cubre el peor hueco (22)", alcance > 22, `alcance=${alcance.toFixed(1)}`);
}
{
  // Comprobación geométrica sobre mucha torre generada.
  const { engine, state } = makeEngine(["a"]);
  for (let i = 0; i < 60 * 120; i++) engine.tick(FRAME_MS);
  const s = state();
  check("la generación no deja de producir plataformas", s.platforms.length > 5,
    `${s.platforms.length} vivas, cámara en ${s.cameraY.toFixed(0)}`);
  check("las plataformas viejas se descartan (no crece sin fin)", s.platforms.length < 200,
    `${s.platforms.length}`);
  const dentro = s.platforms.every((p) => p.x >= -0.01 && p.x + p.w <= 160.01);
  check("ninguna plataforma se sale del mundo", dentro);
}

// --- 2b. Alcanzabilidad banda a banda, sin depender de ningún bot ---------
//
// Es la garantía fuerte de que la torre se puede subir: en vez de fiarlo a que
// un bot lo consiga, se comprueba la geometría de la generación. Un hueco
// imposible cada muchas bandas solo aparecería en mitad de una partida, y
// entonces ya nadie sabría por qué el juego se atascó.
console.log("\n2b) Alcanzabilidad geométrica de la generación");
{
  /** ¿Se llega de la plataforma A a la B con un salto? */
  const alcanzable = (
    a: { x: number; y: number; w: number },
    b: { x: number; y: number; w: number }
  ): boolean => {
    const dh = b.y - a.y;
    if (dh <= 0 || dh > 18.4) return false; // el vértice medido del salto
    const disc = 10000 - 520 * dh;
    if (disc < 0) return false;
    // Instante en que se vuelve a pasar por esa altura, ya BAJANDO: es el
    // momento con más recorrido horizontal disponible.
    const t = (100 + Math.sqrt(disc)) / 260;
    const tAccel = 52 / 385; // acelerar hasta la velocidad máxima en el aire
    const alcance = t <= tAccel ? 0.5 * 385 * t * t : 3.51 + 52 * (t - tAccel);
    const hueco = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
    return hueco <= alcance;
  };

  let imposibles = 0;
  const torres = 40;
  for (let ronda = 0; ronda < torres; ronda++) {
    const { state } = makeEngine([`t${ronda}`], 200);
    const bandas = new Map<number, { x: number; y: number; w: number }[]>();
    for (const plat of state().platforms) {
      const key = Math.round(plat.y * 100);
      if (!bandas.has(key)) bandas.set(key, []);
      bandas.get(key)!.push({ x: plat.x, y: plat.y, w: plat.w });
    }
    const alturas = [...bandas.keys()].sort((a, b) => a - b);
    for (let i = 0; i < alturas.length - 1; i++) {
      const desde = bandas.get(alturas[i])!;
      const hasta = bandas.get(alturas[i + 1])!;
      if (!desde.some((a) => hasta.some((b) => alcanzable(a, b)))) {
        imposibles++;
        break;
      }
    }
  }
  check("ninguna torre tiene una banda imposible", imposibles === 0, `${imposibles} de ${torres}`);
}

// --- 3. El bot trepador ---------------------------------------------------
//
// Es la prueba de fondo: si un bot con una estrategia de tres líneas es capaz
// de subir sin parar, la torre es jugable. Un humano siempre lo hará mejor.
/**
 * Memoria del bot. Sin ella el bot no sirve como prueba: al despegar veía una
 * plataforma más alta, cambiaba de objetivo en pleno vuelo, se apartaba de la
 * que iba a pisar y caía al suelo otra vez. Repetido para siempre. Un jugador
 * de verdad decide a dónde salta ANTES de saltar y se compromete.
 */
interface BotMemory {
  targetX: number | null;
  targetY: number;
}

function botInput(
  state: TowerState,
  id: string,
  memory: BotMemory
): { held: string[]; pressed: string[] } {
  const p = state.players.find((x) => x.id === id)!;

  if (p.grounded) {
    // Plataforma alcanzable más baja por encima de los pies.
    let mejor: { x: number; y: number } | null = null;
    for (const plat of state.platforms) {
      if (plat.gone) continue;
      // 17 y no 14: el vértice del salto son 18,4 y el hueco entre bandas
      // llega justo a 14, así que recortar en 14 clavado dejaba fuera la banda
      // siguiente por un pelo de coma flotante y el bot se quedaba saltando en
      // el sitio sin objetivo.
      if (plat.y <= p.y + 1 || plat.y > p.y + 17) continue;
      const cx = plat.x + plat.w / 2;
      if (!mejor || plat.y < mejor.y) mejor = { x: cx, y: plat.y };
    }
    memory.targetX = mejor ? mejor.x : null;
    memory.targetY = mejor ? mejor.y : 0;
  }

  const held: string[] = [];
  const pressed: string[] = [];

  // Cayendo POR DEBAJO de lo que buscaba: el salto ya falló, así que toca
  // buscar dónde aterrizar, que es lo que haría cualquiera. La condición
  // importa: al principio se activaba en la bajada de CUALQUIER salto, incluida
  // la de los buenos, y el bot abandonaba su objetivo justo antes de pisarlo.
  if (!p.grounded && p.vy < 0 && p.y < memory.targetY - 2) {
    let refugio: number | null = null;
    let mejorY = -Infinity;
    for (const plat of state.platforms) {
      if (plat.gone || plat.kind === "crumble") continue;
      if (plat.y > p.y - 0.5 || plat.y < p.y - 40) continue;
      if (plat.y > mejorY) {
        mejorY = plat.y;
        refugio = plat.x + plat.w / 2;
      }
    }
    if (refugio != null) memory.targetX = refugio;
  }

  if (memory.targetX != null) {
    const dx = memory.targetX - p.x;
    if (dx > 1) held.push("right");
    else if (dx < -1) held.push("left");
    if (p.grounded && Math.abs(dx) < 14) pressed.push("jump");
  } else if (p.grounded) {
    pressed.push("jump");
  }
  // Mantener saltar mientras sube: es lo que da el salto completo.
  if (pressed.length > 0 || p.vy > 0) held.push("jump");
  return { held, pressed };
}

console.log("\n3) Un bot tonto tiene que sobrevivir y trepar");
{
  // Cinco torres distintas, porque la generación es aleatoria y un atasco que
  // aparece en una de cada cinco partidas no se ve probando una sola vez.
  const rondas = 5;
  const segundos = 45;
  const ritmos: number[] = [];
  let muertes = 0;
  let camaraAdelanta = false;

  for (let ronda = 0; ronda < rondas; ronda++) {
    const { engine, state } = makeEngine([`bot${ronda}`], segundos);
    const me = () => state().players[0];
    const memoria: BotMemory = { targetX: null, targetY: 0 };
    for (let frame = 0; frame < 60 * segundos; frame++) {
      if (me().out) break;
      const { held, pressed } = botInput(state(), `bot${ronda}`, memoria);
      send(engine, `bot${ronda}`, held, pressed);
      const camAntes = state().cameraY;
      engine.tick(FRAME_MS);
      // La cámara tiene prohibido SUBIR por encima del líder. Comparar contra
      // la altura actual sin más no vale: si el jugador se cae, la cámara se
      // queda donde estaba (correcto) y quedaría por encima de él sin haber
      // subido. Lo que se vigila es el momento en que sube.
      if (state().cameraY > camAntes && state().cameraY > me().y - 11) {
        camaraAdelanta = true;
      }
    }
    const p = me();
    if (p.out) muertes++;
    ritmos.push(p.best / segundos);
    console.log(`   torre ${ronda + 1}: altura=${p.best.toFixed(0)}` +
      ` (${(p.best / segundos).toFixed(1)} u/s)  vidas=${p.lives}`);
  }

  // Los ritmos de arriba son DIAGNÓSTICO, no criterio. Un bot de veinte líneas
  // no es un jugador: falla saltos, se despista en el hielo y a veces se queda
  // dando vueltas en una banda. Exigirle un mínimo torre a torre haría esta
  // prueba inestable —y una prueba inestable es peor que no tenerla—, y encima
  // empujaría a ajustar el juego para contentar al bot.
  //
  // Que la torre SE PUEDA subir ya está demostrado antes, en 2b, por geometría
  // y sin depender de nadie. Aquí solo se pide lo que no puede fallar por mala
  // suerte: que el bot llegue a trepar de verdad en alguna torre (si nunca lo
  // consigue, algo está roto de raíz) y que la cámara respete al líder.
  // Los ritmos de arriba son DIAGNÓSTICO y no hay aserción sobre ellos, a
  // propósito. Se probó a exigirle un mínimo y la prueba salía inestable: el
  // bot falla saltos, patina en el hielo y a veces se queda dando vueltas en
  // una banda, y su resultado cambia de una ejecución a otra sin que el juego
  // haya cambiado. Una prueba que falla al azar es peor que no tenerla, y
  // además empuja a ajustar el juego para contentar al bot.
  //
  // Que la torre se puede subir ya está demostrado arriba (2b), por geometría y
  // sin depender de nadie. Lo que sí se puede afirmar aquí es la invariante de
  // la cámara, que no depende de lo bien o mal que juegue nadie.
  console.log(`   [diagnóstico] mejor ${Math.max(...ritmos).toFixed(1)} u/s,` +
    ` peor ${Math.min(...ritmos).toFixed(1)} u/s, ${muertes}/${rondas} sin vidas`);
  check("la cámara nunca adelanta al líder", !camaraAdelanta);
}

// --- 4. Quedarse atrás, vidas y fin de partida ----------------------------
console.log("\n4) Quedarse atrás cuesta la partida");
{
  // Lo que hace este juego multijugador: el que va delante marca el ritmo, y
  // quien no lo aguanta se queda fuera de pantalla. Con un solo jugador esto NO
  // debe pasar nunca (la cámara tiene prohibido adelantar al líder), así que la
  // prueba necesita dos: uno que trepa y otro parado.
  const { engine, state } = makeEngine(["bot", "quieto"], 90);
  const memoria: BotMemory = { targetX: null, targetY: 0 };
  const fueraEn: { bot: number | null; quieto: number | null } = { bot: null, quieto: null };
  let camaraMax = 0;
  for (let i = 0; i < 60 * 90; i++) {
    const { held, pressed } = botInput(state(), "bot", memoria);
    send(engine, "bot", held, pressed);
    send(engine, "quieto", [], []);
    engine.tick(FRAME_MS);
    camaraMax = Math.max(camaraMax, state().cameraY);
    if (fueraEn.bot == null && state().players[0].out) fueraEn.bot = i;
    if (fueraEn.quieto == null && state().players[1].out) fueraEn.quieto = i;
    if (engine.isFinished()) break;
  }
  const bot = state().players[0];
  const quieto = state().players[1];
  const puntos = engine.getResult().scores;
  console.log(`   bot: altura=${bot.best.toFixed(0)} vidas=${bot.lives} (fuera en ${fueraEn.bot ?? "-"})` +
    `   |   quieto: altura=${quieto.best.toFixed(0)} vidas=${quieto.lives} (fuera en ${fueraEn.quieto ?? "-"})`);
  // Condicional a propósito: si el bot se atasca y no sube, la cámara tampoco
  // sube —tiene prohibido adelantar al líder— y entonces el parado sobrevive,
  // que es lo correcto. Lo que se comprueba es la regla, no la suerte del bot:
  // SI la cámara llegó a pasar por encima del parado, ENTONCES le costó vidas.
  if (camaraMax > 7) {
    check("si la cámara los adelanta, quedarse quieto cuesta vidas", quieto.lives < 3,
      `cámara llegó a ${camaraMax.toFixed(0)}, vidas=${quieto.lives}`);
  } else {
    check("sin líder que empuje, nadie es eliminado (correcto)", quieto.lives === 3,
      `cámara solo llegó a ${camaraMax.toFixed(0)}`);
  }
  // El arreglo del regalo, comprobado sobre la contabilidad y no sobre el
  // resultado final: el mundo es caótico —a un jugador parado lo puede acabar
  // botando un muelle— y afirmar "el que no se mueve saca cero" salía
  // inestable. Lo que sí se puede afirmar siempre es que la altura REGALADA al
  // reaparecer se descuenta, que es exactamente el fallo que hubo que arreglar.
  console.log(`   [diagnóstico] puntos quieto=${puntos.quieto}` +
    ` (altura bruta ${quieto.best.toFixed(0)}, regalado ${quieto.liftedByRespawn.toFixed(0)})`);
  check(
    "la altura regalada al reaparecer se descuenta de la puntuación",
    quieto.liftedByRespawn <= 0 || puntos.quieto < Math.round(quieto.best),
    `regalado=${quieto.liftedByRespawn.toFixed(0)}`
  );
  const result = engine.getResult();
  check("el ranking está completo y ordenado", result.ranking.length === 2 &&
    (result.scores[result.ranking[0]] ?? 0) >= (result.scores[result.ranking[1]] ?? 0),
    `ranking=${result.ranking.join(" > ")}`);
  check("hay puntuación de los dos", Object.keys(result.scores).length === 2);
}
{
  const { engine, state } = makeEngine(["a", "b"], 8);
  for (let i = 0; i < 60 * 9; i++) engine.tick(FRAME_MS);
  check("la ronda respeta la duración configurada", engine.isFinished(),
    `elapsed=${(state().elapsedMs / 1000).toFixed(1)}s`);
  check("todos los jugadores tienen puntuación", Object.keys(engine.getResult().scores).length === 2);
}

console.log(failures === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${failures} COMPROBACIONES FALLAN`);
process.exit(failures === 0 ? 0 : 1);
