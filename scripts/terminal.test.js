/**
 * The styles edit mode prints with: colors on a terminal, plain text
 * anywhere else, and the `NO_COLOR`, `TERM=dumb` and `FORCE_COLOR` switches.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { styles, takesColor } from "./terminal.js";

const tty = { isTTY: true };
const pipe = { isTTY: false };

test("a terminal takes colors, a pipe or a file doesn't", () => {
    assert.equal(takesColor(tty, {}), true);
    assert.equal(takesColor(pipe, {}), false);
});

test("NO_COLOR and TERM=dumb turn colors off, and FORCE_COLOR decides over both", () => {
    assert.equal(takesColor(tty, { NO_COLOR: "1" }), false);
    assert.equal(takesColor(tty, { TERM: "dumb" }), false);
    assert.equal(takesColor(pipe, { FORCE_COLOR: "1" }), true);
    assert.equal(takesColor(tty, { FORCE_COLOR: "0" }), false);
});

test("each style wraps its text on a terminal and leaves it alone elsewhere", () => {
    assert.equal(styles(tty, {}).cyan("url"), "\x1b[36murl\x1b[39m");
    assert.equal(styles(tty, {}).bold("Open"), "\x1b[1mOpen\x1b[22m");
    assert.equal(styles(pipe, {}).cyan("url"), "url");
});
