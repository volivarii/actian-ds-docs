/**
 * Minimal Node ESM loader for .astro files.
 * Pipeline: .astro -> @astrojs/compiler (emits TS) -> esbuild (strips TS) -> plain ESM.
 * This lets `node --test` import Astro components for experimental_AstroContainer.
 *
 * Usage: node --loader ./tests/components/astro-loader.mjs --test <file>
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

let _astroTransform = null;
let _esbuildTransform = null;

async function getAstroTransform() {
  if (!_astroTransform) {
    const mod = await import("@astrojs/compiler");
    _astroTransform = mod.transform;
  }
  return _astroTransform;
}

async function getEsbuildTransform() {
  if (!_esbuildTransform) {
    const mod = await import("esbuild");
    _esbuildTransform = mod.transform;
  }
  return _esbuildTransform;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(".astro")) {
    const parentDir = context.parentURL
      ? new URL(".", context.parentURL).href
      : pathToFileURL(process.cwd() + "/").href;
    const resolved = new URL(specifier, parentDir);
    return { url: resolved.href, format: "module", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".astro")) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, "utf8");

    // Step 1: Astro compiler -> TypeScript ESM
    const astroTransform = await getAstroTransform();
    const astroResult = await astroTransform(source, {
      filename: filePath,
      internalURL: "astro/runtime/server/index.js",
    });
    if (!astroResult.code) {
      throw new Error("[astro-loader] @astrojs/compiler returned empty code for " + filePath);
    }

    // Step 2: esbuild -> strip TypeScript -> plain ESM
    const esbuildTransform = await getEsbuildTransform();
    const esResult = await esbuildTransform(astroResult.code, {
      loader: "ts",
      format: "esm",
    });

    return {
      format: "module",
      source: esResult.code,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
