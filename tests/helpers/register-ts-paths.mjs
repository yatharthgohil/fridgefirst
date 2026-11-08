// Test-only resolver so `node --test` can load app TypeScript modules that use
// the `@/` alias and extensionless relative imports (as Next.js does).
// Node strips the TypeScript types itself (Node >= 22.18 / 23.6).
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));

function withTsExtension(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith("/") && /\.tsx?$|\.m?js$|\.css$/.test(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = withTsExtension(pathToFileURL(srcDir + specifier.slice(2)));
      if (resolved) return { url: resolved, shortCircuit: true };
    } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const resolved = withTsExtension(new URL(specifier, context.parentURL));
      if (resolved) return { url: resolved, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
