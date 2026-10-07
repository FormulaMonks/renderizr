/**
 * Edit mode's keyboard map (spec 17.2): which physical keys the page and
 * the island take, and how a shortcut reads in each platform's notation.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { keyboardMap, notation, pageCommand } = await importSrc(
    "components/shortcuts",
);
const { editKey, NUDGE_STEP, NUDGE_STEP_LARGE } = await importSrc(
    "engine/react-flow/edit-keys",
);

/** A key press by physical `code`, with `key` and the modifiers held. */
const press = (code, key = "", modifiers = {}) => ({
    code,
    key,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
});

/* --------------------------------------------------------------- notation */

test("a shortcut reads with macOS symbols on a Mac and spelled out elsewhere", () => {
    assert.equal(notation("Alt+Shift+H", true), "⌥⇧H");
    assert.equal(notation("Alt+Shift+H", false), "Alt+Shift+H");
    assert.equal(notation("Mod+Shift+Z", true), "⇧⌘Z");
    assert.equal(notation("Mod+Shift+Z", false), "Ctrl+Shift+Z");
    assert.equal(notation("Mod+S", true), "⌘S");
    assert.equal(notation("Alt+A", false), "Alt+A");
    assert.equal(notation("?", true), "?");
});

/* -------------------------------------------------------------- page keys */

test("Cmd or Ctrl plus Z undoes, plus Shift redoes, and plus S saves, by physical key", () => {
    for (const mac of [true, false]) {
        const mod = mac ? { metaKey: true } : { ctrlKey: true };
        assert.equal(pageCommand(press("KeyZ", "z", mod), mac), "undo");
        assert.equal(
            pageCommand(press("KeyZ", "Z", { ...mod, shiftKey: true }), mac),
            "redo",
        );
        assert.equal(pageCommand(press("KeyS", "s", mod), mac), "save");
        // A layout that puts another letter on the key still undoes.
        assert.equal(pageCommand(press("KeyZ", "y", mod), mac), "undo");
    }
});

test("Ctrl+Y redoes on Windows and Linux, and does nothing on a Mac", () => {
    assert.equal(
        pageCommand(press("KeyY", "y", { ctrlKey: true }), false),
        "redo",
    );
    assert.equal(
        pageCommand(press("KeyY", "y", { ctrlKey: true }), true),
        null,
    );
    assert.equal(
        pageCommand(press("KeyY", "y", { metaKey: true }), true),
        null,
    );
});

test("? opens the keyboard shortcuts, and bare letters do nothing", () => {
    assert.equal(
        pageCommand(press("Slash", "?", { shiftKey: true }), false),
        "shortcuts",
    );
    assert.equal(pageCommand(press("KeyZ", "z"), false), null);
    assert.equal(pageCommand(press("KeyS", "s"), true), null);
    assert.equal(
        pageCommand(press("KeyZ", "z", { ctrlKey: true, altKey: true }), false),
        null,
        "Alt is the island's",
    );
});

/* ------------------------------------------------------------ island keys */

const ALIGN_KEYS = [
    ["KeyA", "left"],
    ["KeyH", "center"],
    ["KeyD", "right"],
    ["KeyW", "top"],
    ["KeyV", "middle"],
    ["KeyS", "bottom"],
];

for (const [code, edge] of ALIGN_KEYS)
    test(`Alt plus ${code} aligns ${edge}, whatever character Option types`, () => {
        assert.deepEqual(editKey(press(code, "å", { altKey: true })), {
            command: "align",
            edge,
        });
    });

test("Alt+Shift+H and Alt+Shift+V distribute", () => {
    assert.deepEqual(
        editKey(press("KeyH", "Ó", { altKey: true, shiftKey: true })),
        { command: "distribute", axis: "horizontal" },
    );
    assert.deepEqual(
        editKey(press("KeyV", "◊", { altKey: true, shiftKey: true })),
        { command: "distribute", axis: "vertical" },
    );
    assert.equal(
        editKey(press("KeyA", "Å", { altKey: true, shiftKey: true })),
        null,
    );
});

test("Cmd or Ctrl plus A selects every element", () => {
    assert.deepEqual(editKey(press("KeyA", "a", { metaKey: true })), {
        command: "selectAll",
    });
    assert.deepEqual(editKey(press("KeyA", "a", { ctrlKey: true })), {
        command: "selectAll",
    });
});

test("the arrow keys nudge by 5, and by 50 with Shift", () => {
    assert.equal(NUDGE_STEP, 5);
    assert.equal(NUDGE_STEP_LARGE, 50);
    assert.deepEqual(editKey(press("ArrowLeft", "ArrowLeft")), {
        command: "nudge",
        step: { x: -5, y: 0 },
    });
    assert.deepEqual(
        editKey(press("ArrowDown", "ArrowDown", { shiftKey: true })),
        { command: "nudge", step: { x: 0, y: 50 } },
    );
    assert.equal(editKey(press("ArrowUp", "ArrowUp", { metaKey: true })), null);
});

test("bare letters and the page's keys are not the island's", () => {
    assert.equal(editKey(press("KeyA", "a")), null);
    assert.equal(editKey(press("KeyZ", "z", { metaKey: true })), null);
    assert.equal(editKey(press("KeyS", "s", { ctrlKey: true })), null);
});

/* ------------------------------------------------------- the dialog's map */

test("the keyboard map groups every key into selection, moving, arranging, history and view", () => {
    const groups = keyboardMap(false);
    assert.deepEqual(
        groups.map((group) => group.name),
        ["Selection", "Moving", "Arranging", "History", "View"],
    );
    const keys = groups.flatMap((group) =>
        group.shortcuts.flatMap((shortcut) => shortcut.keys),
    );
    for (const key of [
        "Ctrl+A",
        "Escape",
        "Space",
        "Enter",
        "Tab",
        "Arrow keys",
        "Shift+Arrow keys",
        "Alt+A",
        "Alt+H",
        "Alt+D",
        "Alt+W",
        "Alt+V",
        "Alt+S",
        "Alt+Shift+H",
        "Alt+Shift+V",
        "Ctrl+Z",
        "Ctrl+Shift+Z",
        "Ctrl+Y",
        "Ctrl+S",
        "+",
        "-",
        "0",
        "?",
    ])
        assert.ok(keys.includes(key), `the map leaves out ${key}`);
});

test("the keyboard map on a Mac reads in its notation and leaves out Ctrl+Y", () => {
    const keys = keyboardMap(true).flatMap((group) =>
        group.shortcuts.flatMap((shortcut) => shortcut.keys),
    );
    assert.ok(keys.includes("⇧⌘Z"));
    assert.ok(keys.includes("⌥⇧H"));
    assert.ok(!keys.includes("Ctrl+Y"));
});
