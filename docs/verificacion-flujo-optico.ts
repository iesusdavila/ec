/**
 * Arnés de verificación del estimador de flujo óptico.
 *
 *     node --experimental-strip-types docs/verificacion-flujo-optico.ts
 *
 * Sigue la línea de §8.1 del HANDOFF —Node ejecuta el TypeScript directamente,
 * sin suite de tests ni dependencias nuevas—, pero este se deja escrito en vez
 * de recrearlo, porque comprueba cosas que NO se pueden mirar a ojo en un
 * teléfono: si un signo está invertido, el cursor se mueve al revés y eso sí se
 * nota, pero si la compensación de giro está a medias el cursor solo se
 * comporta "un poco raro" y es imposible saber por qué.
 *
 * De hecho encontró dos fallos reales antes de que esto llegara a un teléfono:
 *
 *  1. La búsqueda SSD devuelve el desplazamiento de la VENTANA de búsqueda, que
 *     es el negativo del flujo de la imagen. Toda la geometría estaba escrita
 *     en términos de flujo, así que el cursor se habría movido justo al revés.
 *  2. El peso del valor previo de la regresión estaba ~10.000 veces por encima
 *     de la escala real de g² (la mano gira ~0,012 rad entre fotogramas). La
 *     regresión jamás habría aprendido la focal del teléfono: la compensación
 *     de giro se habría quedado a medias para siempre, y girar la muñeca
 *     seguiría moviendo el cursor.
 *
 * La idea: se fabrica una textura grande y cada "fotograma" es un recorte de
 * ella. Mover la ventana de recorte equivale exactamente a que la escena se
 * desplace en la imagen, que es lo que produce girar o trasladar la cámara. Así
 * se conoce la respuesta correcta con precisión de subpíxel.
 */

import { FlowEstimator, FLOW_W, FLOW_H } from "../src/core/sensors/tracking/flowEstimator.ts";

const TEX_W = 256;
const TEX_H = 256;

let seed = 12345;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

const raw = new Float32Array(TEX_W * TEX_H);
for (let i = 0; i < raw.length; i++) raw[i] = rnd() * 255;

// Suavizado: el ruido blanco puro no sobrevive al muestreo subpíxel y el
// emparejamiento saldría peor de lo que sale con una escena real.
const tex = new Float32Array(TEX_W * TEX_H);
const BLUR = 2;
for (let y = 0; y < TEX_H; y++) {
  for (let x = 0; x < TEX_W; x++) {
    let sum = 0;
    let n = 0;
    for (let dy = -BLUR; dy <= BLUR; dy++) {
      for (let dx = -BLUR; dx <= BLUR; dx++) {
        sum += raw[(((y + dy + TEX_H) % TEX_H) * TEX_W) + ((x + dx + TEX_W) % TEX_W)];
        n++;
      }
    }
    tex[y * TEX_W + x] = sum / n;
  }
}

function texel(x: number, y: number): number {
  const yy = ((y % TEX_H) + TEX_H) % TEX_H;
  const xx = ((x % TEX_W) + TEX_W) % TEX_W;
  return tex[yy * TEX_W + xx];
}

function sample(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  return (
    texel(x0, y0) * (1 - fx) * (1 - fy) +
    texel(x0 + 1, y0) * fx * (1 - fy) +
    texel(x0, y0 + 1) * (1 - fx) * fy +
    texel(x0 + 1, y0 + 1) * fx * fy
  );
}

/** Recorta un fotograma con la ventana desplazada a (ox, oy). */
function frame(ox: number, oy: number): Float32Array {
  const out = new Float32Array(FLOW_W * FLOW_H);
  for (let y = 0; y < FLOW_H; y++) {
    for (let x = 0; x < FLOW_W; x++) {
      out[y * FLOW_W + x] = sample(90 + x + ox, 90 + y + oy);
    }
  }
  return out;
}

/**
 * Focal "real" del teléfono simulado, a propósito DISTINTA de la semilla del
 * estimador (~50,2 px/rad): así la prueba comprueba que la regresión aprende el
 * valor de verdad, y no que acertamos con el previo.
 */
const F_TRUE = 62;

interface Step {
  /** Giro sobre el eje Y del teléfono (guiñada), en radianes. */
  yaw?: number;
  /** Giro sobre el eje X (cabeceo), en radianes. */
  pitch?: number;
  /** Traslación en X e Y, como razón traslación/profundidad. */
  tx?: number;
  ty?: number;
}

/** Rotación involuntaria de la mano: siempre está, y es lo que enseña la focal. */
const WARMUP: Step[] = Array.from({ length: 120 }, (_, i) => ({
  yaw: 0.02 * Math.sin(i / 3),
  pitch: 0.015 * Math.cos(i / 4),
}));

/**
 * @param R Cómo entrega el navegador la imagen (identidad, girada, espejada…).
 *          Es lo que cambia de un teléfono a otro y lo que la regresión debe
 *          absorber sola.
 */
function run(steps: Step[], warmup = true, R: number[] = [1, 0, 0, 1]) {
  const all = warmup ? [...WARMUP, ...steps] : steps;
  const est = new FlowEstimator();
  let rotX = 0;
  let rotY = 0;
  let ox = 0;
  let oy = 0;
  const out: ReturnType<FlowEstimator["push"]>[] = [];

  est.push(frame(0, 0), 0, 0); // primer fotograma: no hay anterior con el que comparar
  for (const s of all) {
    // Flujo en el sistema canónico de la cámara:
    //   guiñada +g mueve la escena a +x; trasladarse en +X la mueve a −x.
    //   cabeceo +g la mueve a +y; trasladarse en +Y también a +y.
    const cx = F_TRUE * ((s.yaw ?? 0) - (s.tx ?? 0));
    const cy = F_TRUE * ((s.pitch ?? 0) + (s.ty ?? 0));
    const fx = R[0] * cx + R[1] * cy;
    const fy = R[2] * cx + R[3] * cy;
    // La ventana de recorte se mueve al revés que el contenido.
    ox -= fx;
    oy -= fy;
    rotX += s.pitch ?? 0;
    rotY += s.yaw ?? 0;
    out.push(est.push(frame(ox, oy), rotX, rotY));
  }
  return { out, model: est.getModel() };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rms = (xs: number[]) => Math.sqrt(mean(xs.map((v) => v * v)));

let failures = 0;
function check(name: string, actual: number, expected: number, tol: number): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASA " : "FALLA"}  ${name.padEnd(46)} obtenido=${actual.toFixed(4).padStart(9)}` +
      ` esperado=${expected.toFixed(4).padStart(9)} tol=${tol}`
  );
}

console.log("\n1) Traslación pura (el teléfono se mueve, no gira)");
{
  const r = 0.02;
  const tailFrom = WARMUP.length + 2;
  {
    const { out } = run(Array.from({ length: 12 }, () => ({ tx: r })));
    const tail = out.slice(tailFrom);
    check("+X del teléfono -> tx positivo", mean(tail.map((s) => s.tx)), r, 0.004);
    check("  sin fuga al eje Y", mean(tail.map((s) => s.ty)), 0, 0.004);
    check("  confianza alta", mean(tail.map((s) => s.confidence)), 1, 0.35);
  }
  {
    const { out } = run(Array.from({ length: 12 }, () => ({ ty: r })));
    const tail = out.slice(tailFrom);
    check("+Y del teléfono -> ty positivo", mean(tail.map((s) => s.ty)), r, 0.004);
    check("  sin fuga al eje X", mean(tail.map((s) => s.tx)), 0, 0.004);
  }
  {
    const { out } = run(Array.from({ length: 12 }, () => ({ tx: -r })));
    const tail = out.slice(tailFrom);
    check("-X del teléfono -> tx negativo", mean(tail.map((s) => s.tx)), -r, 0.004);
  }
}

console.log("\n2) Rotación pura (girar la muñeca no debe mover nada)");
{
  const steps: Step[] = Array.from({ length: 90 }, (_, i) => ({
    yaw: 0.02 * Math.sin(i / 3),
    pitch: 0.015 * Math.cos(i / 4),
  }));
  const { out, model } = run(steps, false);
  const tail = out.slice(60);
  check("giro puro -> tx residual ~0", rms(tail.map((s) => s.tx)), 0, 0.004);
  check("giro puro -> ty residual ~0", rms(tail.map((s) => s.ty)), 0, 0.004);
  if (!model) throw new Error("el estimador no devolvió modelo");
  check("aprende la focal real (guiñada)", Math.hypot(model.yaw.x, model.yaw.y), F_TRUE, 3);
  check("aprende la focal real (cabeceo)", Math.hypot(model.pitch.x, model.pitch.y), F_TRUE, 3);
}

console.log("\n3) Traslación + rotación simultáneas (el caso real)");
{
  const r = 0.015;
  const steps: Step[] = Array.from({ length: 90 }, (_, i) => ({
    tx: r,
    yaw: 0.02 * Math.sin(i / 3),
    pitch: 0.015 * Math.cos(i / 4),
  }));
  const { out } = run(steps, false);
  const tail = out.slice(60);
  check("recupera solo la traslación", mean(tail.map((s) => s.tx)), r, 0.004);
  check("  sin arrastrar el giro al eje Y", mean(tail.map((s) => s.ty)), 0, 0.004);
}

console.log("\n4) Escena sin textura (pared lisa / oscuridad)");
{
  const est = new FlowEstimator();
  const flat = new Float32Array(FLOW_W * FLOW_H).fill(40);
  est.push(flat, 0, 0);
  const res = est.push(flat, 0, 0);
  // Lo importante es que diga "no lo sé" y NO "está quieto": si dijera quieto,
  // el filtro del jugador frenaría el cursor en seco creyendo una medida buena.
  check("confianza 0 en vez de 'quieto'", res.confidence, 0, 0.0001);
}

console.log("\n5) Imagen girada / espejada (varía de un teléfono a otro)");
{
  const cases: [string, number[]][] = [
    ["girada 90°     ", [0, -1, 1, 0]],
    ["girada 180°    ", [-1, 0, 0, -1]],
    ["espejada en X  ", [-1, 0, 0, 1]],
    ["girada+espejada", [0, 1, 1, 0]],
  ];
  const r = 0.015;
  for (const [name, R] of cases) {
    const steps: Step[] = Array.from({ length: 180 }, (_, i) => ({
      tx: r,
      yaw: 0.02 * Math.sin(i / 3),
      pitch: 0.015 * Math.cos(i / 4),
    }));
    const { out } = run(steps, false, R);
    const tail = out.slice(140);
    check(`${name} recupera tx`, mean(tail.map((s) => s.tx)), r, 0.004);
    check(`${name} sin fuga a ty`, mean(tail.map((s) => s.ty)), 0, 0.004);
  }
}

// --- 6. Movimiento ACOPLADO: girar y trasladar siempre a la vez -----------
//
// Es lo que pasa de verdad al llegar al límite del alcance del brazo: uno gira
// la muñeca y desplaza el teléfono juntos y siempre igual. Dos señales
// correlacionadas son inseparables por mínimos cuadrados, así que la sospecha
// es que la regresión se traga la traslación dentro de M y acaba cancelando el
// movimiento del jugador (síntoma: el cursor se queda clavado en el borde y
// solo vuelve pulsando "Recentrar", que resetea la regresión).
//
// Esta prueba existe para AVERIGUAR si eso pasa de verdad, no para darlo por
// hecho: mide si el tx reportado decae con el tiempo bajo movimiento acoplado.
console.log('\n6) Girar y trasladar acoplados (límite del alcance del brazo)');
{
  const r = 0.012;
  // La guiñada acompaña siempre a la traslación, con la misma forma.
  const steps: Step[] = Array.from({ length: 400 }, () => ({ tx: r, yaw: 0.03 }));
  const { out, model } = run(steps, false);
  const inicio = mean(out.slice(20, 60).map((s) => s.tx));
  const final = mean(out.slice(340, 390).map((s) => s.tx));
  console.log(`   tx al principio=${inicio.toFixed(4)}  al final=${final.toFixed(4)}` +
    `  focal aprendida=${model ? Math.hypot(model.yaw.x, model.yaw.y).toFixed(1) : '?'}` +
    ` (real ${F_TRUE})`);
  check('el movimiento acoplado NO se cancela con el tiempo', final, inicio, Math.abs(inicio) * 0.35);
  check('sigue reportando traslación (no se queda clavado)', Math.abs(final), r, r * 0.6);
}

console.log(
  failures === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${failures} COMPROBACIONES FALLAN`
);
process.exit(failures === 0 ? 0 : 1);
