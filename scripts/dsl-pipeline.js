import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { runTools } from "./structurizr-tools.js";

/**
 * The DSL pipeline of a DSL session (spec 5, ADR 16): it runs the author's
 * Structurizr tools on `workspace.dsl`, `merge` with `workspace.json` as the
 * layout, or `export` while there is none, and writes what they produce into
 * `workspace.json` through the writer, so the layout the author saved
 * carries over every DSL change exactly as Structurizr Local carries it.
 *
 * Runs go one at a time. Changes under the DSL's folder start one about
 * `debounce` ms after the last of them, and changes during a run get one
 * more run after it. Each run first asks the open pages to save what waits,
 * so `merge` takes their layout too. The tools always write into a
 * temporary dot folder beside the DSL, which they can reach even from a
 * Docker container that mounts only that folder, and never `workspace.json`
 * itself.
 */

/** How long the pipeline waits after the last change (spec 5.2). */
export const DEBOUNCE_MS = 300;

/**
 * Whether a change to `path` under `folder`, the DSL's, runs the pipeline:
 * not `json`, which the pipeline and the page's saves write, and nothing in
 * `node_modules` or under a name that starts with a dot, such as `.git`, the
 * pipeline's temporary folders and the writer's temporary files (spec 5.2).
 */
export function triggersRun(path, { folder, json }) {
    if (path === json) return false;
    const inside = relative(folder, path);
    if (!inside || inside.startsWith("..")) return false;
    return !inside
        .split(sep)
        .some((part) => part.startsWith(".") || part === "node_modules");
}

/** Stack frames and the tools' own log lines, which say nothing to the author. */
const NOISE =
    /^\s+at |^\s*\.\.\. \d+ more|^\S+ \[[^\]]+\] (INFO|DEBUG) |^INFO /;

/**
 * The message the page shows for a run that ended with `code` and printed
 * `output` (spec 5.3): what the tools reported, without their log lines,
 * stack frames and the Java exception's class name.
 */
export function errorMessage(output, code) {
    const lines = output
        .split(/\r?\n/)
        .filter((line) => line.trim() && !NOISE.test(line))
        .map((line) =>
            line.replace(/^(?:[\w$]+\.)+[\w$]*(?:Exception|Error): /, ""),
        );
    return lines.length > 0
        ? lines.join("\n")
        : `Structurizr's tools exited with code ${code} and said nothing more.`;
}

const nothing = () => {};

export class DslPipeline {
    #dsl;
    #json;
    #command;
    #writer;
    #output;
    #debounce;
    #hooks = { flush: nothing, published: nothing, failed: nothing };
    #timer = null;
    #running = null;
    #again = false;
    #closed = false;

    /** Whether any run has succeeded. */
    succeeded = false;
    /** The last run's error, or `null` when it succeeded. */
    error = null;

    /**
     * A pipeline on `dsl` that writes `json` through `writer`, running the
     * tools with `command`, a prefix the shell reads as typed, and copying
     * their output to `output`.
     */
    constructor({
        dsl,
        json,
        command,
        writer,
        output = process.stdout,
        debounce = DEBOUNCE_MS,
    }) {
        this.#dsl = dsl;
        this.#json = json;
        this.#command = command;
        this.#writer = writer;
        this.#output = output;
        this.#debounce = debounce;
    }

    /** The folder whose changes run the pipeline. */
    get folder() {
        return dirname(this.#dsl);
    }

    /**
     * Tell the pages: `flush()` asks them to save and resolves once they
     * have, `published()` sends them `workspace.json` and `failed(error)` the
     * error of a run. Before this, runs tell nobody.
     */
    connect({ flush, published, failed }) {
        this.#hooks = { flush, published, failed };
    }

    /**
     * Run the pipeline now, or once more after the run under way. Resolves
     * with whether the last run succeeded.
     */
    run() {
        if (this.#running) {
            this.#again = true;
            return this.#running;
        }
        this.#running = this.#loop().finally(() => {
            this.#running = null;
        });
        return this.#running;
    }

    /** A file under the DSL's folder changed: run once the changes settle. */
    changed() {
        if (this.#closed) return;
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.#timer = null;
            this.run().catch((error) => this.#output.write(`${error.stack}\n`));
        }, this.#debounce);
    }

    /** Stop running on changes, once the run under way ends. */
    async close() {
        this.#closed = true;
        clearTimeout(this.#timer);
        await this.#running?.catch(nothing);
    }

    async #loop() {
        let succeeded;
        do {
            this.#again = false;
            await this.#hooks.flush();
            succeeded = await this.#once();
        } while (this.#again && !this.#closed);
        return succeeded;
    }

    /** One run of the tools, and what comes of it. */
    async #once() {
        const folder = this.folder;
        const temporary = await mkdtemp(join(folder, ".renderizr-"));
        const output = relative(folder, temporary);
        const merging = existsSync(this.#json);
        const args = merging
            ? [
                  "merge",
                  "-workspace",
                  basename(this.#dsl),
                  "-layout",
                  relative(folder, this.#json),
                  "-output",
                  join(output, "workspace.json"),
              ]
            : [
                  "export",
                  "-workspace",
                  basename(this.#dsl),
                  "-format",
                  "json",
                  "-output",
                  output,
              ];
        try {
            const result = await runTools(this.#command, args, {
                cwd: folder,
                output: this.#output,
            });
            const [produced] = (await readdir(temporary)).filter((name) =>
                name.endsWith(".json"),
            );
            const text =
                result.code === 0 && produced
                    ? await readFile(join(temporary, produced), "utf8")
                    : null;
            if (text === null) {
                return this.#fail(errorMessage(result.output, result.code));
            }
            try {
                await this.#writer.replace(text);
            } catch (error) {
                return this.#fail(
                    `${basename(this.#json)} couldn't be written: ${error.message}`,
                );
            }
            this.succeeded = true;
            this.error = null;
            await this.#hooks.published();
            return true;
        } finally {
            await rm(temporary, { recursive: true, force: true });
        }
    }

    async #fail(error) {
        this.error = error;
        await this.#hooks.failed(error);
        return false;
    }
}
