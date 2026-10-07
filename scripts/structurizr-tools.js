import { spawn, spawnSync } from "node:child_process";

/**
 * Structurizr's tools as edit mode and the acceptance fixture run them (spec
 * 5.1, ADR 16): one command prefix, the `STRUCTURIZR_CLI` environment
 * variable when set, otherwise `structurizr-cli` on the `PATH`. The prefix
 * runs through the shell, so it may be any command the author would type:
 * `java -jar ~/bin/structurizr.war`, or a `docker run` with quoted
 * arguments and `$PWD`.
 */

/** Where the README says how to set the tools up. */
export const TOOLS_README =
    "https://github.com/FormulaMonks/renderizr#edit-mode";

/** The tools' command prefix in `env`. */
export const toolsCommand = (env = process.env) =>
    env.STRUCTURIZR_CLI?.trim() || "structurizr-cli";

/** `arg` quoted for the shell `spawn` runs on this platform. */
const quote = (arg) =>
    process.platform === "win32"
        ? `"${arg.replace(/"/g, '""')}"`
        : `'${arg.replace(/'/g, "'\\''")}'`;

/** `command`, a prefix the shell reads as typed, followed by `args` quoted. */
export const shellCommand = (command, args) =>
    [command, ...args.map(quote)].join(" ");

/**
 * Run `command` with its `version` subcommand, which every distribution of
 * the tools has, from `cwd`. `{ ok, output }`.
 */
export function checkTools(command, { cwd = process.cwd() } = {}) {
    const result = spawnSync(shellCommand(command, ["version"]), {
        cwd,
        shell: true,
        encoding: "utf8",
        timeout: 120_000,
    });
    return {
        ok: result.status === 0,
        output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
}

/**
 * What edit mode says when the tools it needs for `dsl` don't answer (spec
 * 5.1): both ways to name them, the Java versions they run on and the
 * README.
 */
export const toolsMessage = (dsl, command) =>
    `Edit mode opens ${dsl} with Structurizr's tools, and "${command} version" didn't run. Set STRUCTURIZR_CLI to the command that runs them, such as "java -jar ~/bin/structurizr.war", or put structurizr-cli on your PATH. They need Java 21 to 25. See ${TOOLS_README}`;

/**
 * Run `command` with `args` from `cwd`, copying its output to `output` as it
 * comes. Resolves with its exit `code` and everything it printed.
 */
export function runTools(command, args, { cwd, output = process.stdout }) {
    return new Promise((done) => {
        const child = spawn(shellCommand(command, args), {
            cwd,
            shell: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        const chunks = [];
        const take = (chunk) => {
            chunks.push(chunk);
            output.write(chunk);
        };
        child.stdout.on("data", take);
        child.stderr.on("data", take);
        child.on("error", (error) => {
            take(Buffer.from(`${error.message}\n`));
        });
        child.on("close", (code) =>
            done({ code: code ?? 1, output: Buffer.concat(chunks).toString() }),
        );
    });
}
