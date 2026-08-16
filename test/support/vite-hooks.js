/**
 * Module customization hooks that let `node --test` import the application's
 * TypeScript sources directly, without a build step and without adding a test
 * framework or a transpiler to the dependency list.
 *
 * Three things stand between `src/*.ts` and a plain `import()`:
 *
 *   1. It is TypeScript. Node 22.6+ can strip types itself, but the package
 *      supports Node 20, so the transform is done here with the esbuild that
 *      Vite already depends on — the same transformer the real build uses.
 *   2. Imports are extensionless (`./markdown-alerts`), which TypeScript
 *      resolves and Node does not.
 *   3. Two import forms only exist inside Vite: CSS modules
 *      (`./x.module.css` -> an object of class names) and `?raw`
 *      (`./icon.svg?raw` -> the file's text).
 *
 * CSS modules are stubbed with a proxy that returns the property name, so a
 * test can assert `class="alert alertNote"` and stay readable no matter what
 * hash Vite would have generated. `?raw` reads the real file, so the icons the
 * alert tests assert on are the icons that ship.
 *
 * Registered by `./ts.js`; never imported directly by a test.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/**
 * esbuild is Vite's dependency, not ours, so it is reached through Vite rather
 * than through the top level of `node_modules` (which, under pnpm, does not
 * have it).
 */
const esbuild = createRequire(require.resolve("vite"))("esbuild");

const CSS_PREFIX = "renderizr-css:";
const RAW_PREFIX = "renderizr-raw:";

const isRelative = (specifier) => /^\.{1,2}\//.test(specifier);

/** Relative, absolute or already a `file:` URL — anything but a bare package. */
const isPath = (specifier) =>
    isRelative(specifier) ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:");

/** The first of `specifier`, `specifier.ts`, `specifier/index.ts` that exists. */
function resolveTs(specifier, parentURL) {
    for (const candidate of [
        specifier,
        `${specifier}.ts`,
        `${specifier}/index.ts`,
    ]) {
        const url = new URL(candidate, parentURL);
        if (existsSync(fileURLToPath(url))) return url.href;
    }
    return null;
}

export async function resolve(specifier, context, next) {
    const parentURL = context.parentURL ?? import.meta.url;

    if (specifier.endsWith(".css") && isPath(specifier)) {
        return {
            url: CSS_PREFIX + new URL(specifier, parentURL).href,
            format: "module",
            shortCircuit: true,
        };
    }

    if (specifier.includes("?raw")) {
        const [path] = specifier.split("?");
        return {
            url: RAW_PREFIX + new URL(path, parentURL).href,
            format: "module",
            shortCircuit: true,
        };
    }

    if (isPath(specifier)) {
        const url = resolveTs(specifier, parentURL);
        if (url?.endsWith(".ts")) {
            return { url, format: "module", shortCircuit: true };
        }
    }

    try {
        return await next(specifier, context);
    } catch (error) {
        // Vite resolves extensionless deep imports into a package and Node
        // does not, which is why `src/components/router.ts` can say
        // `import history from "history/hash"`. Retrying with the extension
        // reaches the same file, and so the same module instance the tests
        // drive through `support/history.js`.
        if (
            error?.code !== "ERR_MODULE_NOT_FOUND" ||
            /\.[a-z]+$/.test(specifier)
        ) {
            throw error;
        }
        return next(`${specifier}.js`, context);
    }
}

export async function load(url, context, next) {
    if (url.startsWith(CSS_PREFIX)) {
        return {
            format: "module",
            shortCircuit: true,
            source:
                "export default new Proxy({}, {" +
                "  get: (_, key) => (typeof key === 'string' ? key : undefined)," +
                "});",
        };
    }

    if (url.startsWith(RAW_PREFIX)) {
        const path = fileURLToPath(url.slice(RAW_PREFIX.length));
        const text = readFileSync(path, "utf-8");
        return {
            format: "module",
            shortCircuit: true,
            source: `export default ${JSON.stringify(text)};`,
        };
    }

    if (url.endsWith(".ts")) {
        const path = fileURLToPath(url);
        // An inline source map is what lets `--experimental-test-coverage`
        // report against the TypeScript line numbers rather than esbuild's.
        const { code } = esbuild.transformSync(readFileSync(path, "utf-8"), {
            loader: "ts",
            format: "esm",
            target: "esnext",
            sourcefile: path,
            sourcemap: "inline",
        });
        return { format: "module", shortCircuit: true, source: code };
    }

    return next(url, context);
}
