/**
 * Engancha el resolvedor de alias. Uso:
 *
 *     node --import ./docs/alias-loader.mjs --experimental-strip-types <arnés>
 */
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
