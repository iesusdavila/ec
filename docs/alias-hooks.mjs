/**
 * Resuelve el alias `@/...` a `src/...` para los arneses de verificación.
 *
 * Node ejecuta el TypeScript de este proyecto tal cual (`--experimental-strip-types`),
 * pero no sabe nada de los `paths` del tsconfig. Hasta ahora eso se sorteaba
 * copiando los archivos a un directorio temporal y reescribiendo los imports
 * con `sed` (§8.1 del HANDOFF), lo que obliga a rehacer la copia con cada
 * cambio y deja la duda de si lo que se midió era el código de verdad.
 *
 * Con este gancho, un arnés importa directamente del árbol real.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (!specifier.startsWith("@/")) return next(specifier, context);

  const base = new URL(specifier.slice(2), SRC);
  for (const candidate of [base.href, `${base.href}.ts`, `${base.href}.tsx`]) {
    if (existsSync(fileURLToPath(candidate))) {
      return next(candidate, context);
    }
  }
  return next(base.href, context);
}
