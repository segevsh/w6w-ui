import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import ts from "typescript";

register(import.meta.url, import.meta.url);

export async function load(url, context, nextLoad) {
  // Defensive stub: Node's ESM loader has no handler for `.css` and throws
  // `ERR_UNKNOWN_FILE_EXTENSION` under `node --test`. No component imports CSS
  // any more (React Flow's base rules ship inside `styles.css`), but a future
  // import of a stylesheet must not take the whole suite down. An empty module
  // is enough — the harness doesn't render CSS.
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  if (url.endsWith(".tsx")) {
    const path = fileURLToPath(url);
    const source = readFileSync(path, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "react",
        esModuleInterop: true,
      },
      fileName: path,
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
