import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Reads a TypeScript module out of the app's tree and hands back what it
 * exports.
 *
 * The app's strings and the screenshot scenes are `.ts`, these tools are
 * `.mjs`, and the two have to meet somewhere. They meet here rather than in a
 * copy, because the whole reason to reach into the app is that a second copy
 * would be free to be wrong.
 *
 * Every file this loads is a plain object literal behind an `import type`, so
 * stripping the types leaves runnable JavaScript and no bundler is needed.
 * Imports inside the transpiled text resolve against a data URL, which has no
 * directory, so anything such a file reaches for has to be a type — a module
 * with a real import will fail here rather than load half of itself.
 * `transpileModule` does not typecheck, which is what `npm run typecheck` is for.
 */
export async function loadFromSource(file) {
  const js = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
