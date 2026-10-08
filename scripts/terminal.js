/**
 * Styles for what edit mode prints: ANSI colors and weights on a terminal,
 * plain text anywhere else, so a log file or a test reads the words alone.
 * `NO_COLOR` (https://no-color.org) and `TERM=dumb` turn them off, and
 * `FORCE_COLOR` turns them on, or off when it is `0`.
 */

/** Each style's opening and closing SGR codes. */
const CODES = {
    bold: [1, 22],
    dim: [2, 22],
    underline: [4, 24],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    cyan: [36, 39],
};

/** Whether `stream` takes colors, as `env` says. */
export function takesColor(stream = process.stdout, env = process.env) {
    if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
    if (env.NO_COLOR) return false;
    return Boolean(stream.isTTY) && env.TERM !== "dumb";
}

/**
 * A function per style that wraps its text for `stream`, or leaves it
 * plain when the stream takes no colors.
 *
 * @returns {Record<keyof typeof CODES, (text: string) => string>}
 */
export function styles(stream = process.stdout, env = process.env) {
    const on = takesColor(stream, env);
    return Object.fromEntries(
        Object.entries(CODES).map(([name, [open, close]]) => [
            name,
            (text) => (on ? `\x1b[${open}m${text}\x1b[${close}m` : text),
        ]),
    );
}
