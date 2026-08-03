import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import ts from "typescript";

register(import.meta.url, import.meta.url);

export async function load(url, context, nextLoad) {
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
