/**
 * Edit mode's keyboard map (spec 17.2): the keys the page takes wherever
 * focus is, how every shortcut reads in the platform's notation, and the
 * groups the "Keyboard shortcuts" dialog lists. Keys match by physical key,
 * so Option's characters on macOS don't get in the way. Only edit mode
 * reads it; builds compile it out (ADR 15).
 */

/** Whether shortcuts read the macOS way (spec 17.1). */
export const isMac = () =>
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform ?? "");

const MAC_SYMBOLS: Record<string, string> = {
    Ctrl: "⌃",
    Alt: "⌥",
    Shift: "⇧",
    Mod: "⌘",
};

/** The order modifiers read in: as macOS menus put them, and elsewhere. */
const MAC_ORDER = ["Ctrl", "Alt", "Shift", "Mod"];
const ORDER = ["Mod", "Ctrl", "Alt", "Shift"];

/**
 * `combo`, written as `Mod+Shift+Z` with `Mod` for Cmd or Ctrl, in the
 * platform's notation: `⇧⌘Z` on macOS, `Ctrl+Shift+Z` elsewhere.
 */
export function notation(combo: string, mac = isMac()): string {
    const parts = combo.split("+");
    const key = parts.pop() || "+";
    const held = (mac ? MAC_ORDER : ORDER).filter((modifier) =>
        parts.includes(modifier),
    );
    if (mac) {
        const symbols = held.map((modifier) => MAC_SYMBOLS[modifier]).join("");
        return symbols && key.length > 1 ? `${symbols} ${key}` : symbols + key;
    }
    return [...held.map((m) => (m === "Mod" ? "Ctrl" : m)), key].join("+");
}

/** The shortcuts of the edit toolbar's buttons, as `notation` takes them. */
export const SHORTCUTS = {
    left: "Alt+A",
    center: "Alt+H",
    right: "Alt+D",
    top: "Alt+W",
    middle: "Alt+V",
    bottom: "Alt+S",
    horizontal: "Alt+Shift+H",
    vertical: "Alt+Shift+V",
    routing: "Alt+R",
    undo: "Mod+Z",
    redo: "Mod+Shift+Z",
    save: "Mod+S",
    shortcuts: "?",
} as const;

/** What a page key does (spec 17.2). */
export type PageCommand = "undo" | "redo" | "save" | "shortcuts" | "routing";

/** The parts of a key press the keyboard map reads. */
export type KeyPress = Pick<
    KeyboardEvent,
    "code" | "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey"
>;

/**
 * The page key `event` presses, or `null`: Cmd/Ctrl+Z undoes, with Shift
 * redoes, as does Ctrl+Y on Windows and Linux; Cmd/Ctrl+S saves; Alt+R
 * moves the selected edge to its next routing mode, by physical key, so
 * Option's character on macOS doesn't get in the way; `?`, the one bare
 * key, opens "Keyboard shortcuts". Cmd/Ctrl+R stays the browser's reload.
 */
export function pageCommand(
    event: KeyPress,
    mac = isMac(),
): PageCommand | null {
    const mod = event.metaKey || event.ctrlKey;
    if (event.altKey)
        return event.code === "KeyR" && !mod && !event.shiftKey
            ? "routing"
            : null;
    if (mod) {
        if (event.code === "KeyS") return "save";
        if (event.code === "KeyZ") return event.shiftKey ? "redo" : "undo";
        if (event.code === "KeyY" && !mac && event.ctrlKey && !event.shiftKey)
            return "redo";
        return null;
    }
    if (event.key === "?" || (event.code === "Slash" && event.shiftKey))
        return "shortcuts";
    return null;
}

/** One line of the dialog: what it does and the keys that do it. */
export type ShortcutLine = { does: string; keys: string[] };

/** One group of the dialog. */
export type ShortcutGroup = { name: string; shortcuts: ShortcutLine[] };

/**
 * Every key edit mode takes, in the dialog's groups: selection, moving,
 * arranging, history and view (spec 17.2).
 */
export function keyboardMap(mac = isMac()): ShortcutGroup[] {
    const line = (does: string, ...combos: string[]): ShortcutLine => ({
        does,
        keys: combos.map((combo) => notation(combo, mac)),
    });
    return [
        {
            name: "Selection",
            shortcuts: [
                line("Select every element in the view", "Mod+A"),
                line(
                    "Close a menu, then clear the selection or the selected edge, then end the animation",
                    "Escape",
                ),
                line(
                    "Add the focused element to the selection, or take it out (a tap)",
                    "Space",
                ),
                line("Walk the focus order", "Tab"),
                line("Open the focused item's activation targets", "Enter"),
            ],
        },
        {
            name: "Moving",
            shortcuts: [
                line("Nudge the selection by 5", "Arrow keys"),
                line("Nudge the selection by 50", "Shift+Arrow keys"),
                line("Pan, with nothing selected", "Arrow keys"),
                line("Pan while dragging", "Space"),
            ],
        },
        {
            name: "Arranging",
            shortcuts: [
                line("Align left", SHORTCUTS.left),
                line("Align horizontal centers", SHORTCUTS.center),
                line("Align right", SHORTCUTS.right),
                line("Align top", SHORTCUTS.top),
                line("Align vertical centers", SHORTCUTS.middle),
                line("Align bottom", SHORTCUTS.bottom),
                line("Distribute horizontally", SHORTCUTS.horizontal),
                line("Distribute vertically", SHORTCUTS.vertical),
                line(
                    "Cycle routing modes for selected relationship",
                    SHORTCUTS.routing,
                ),
            ],
        },
        {
            name: "History",
            shortcuts: [
                line("Undo", SHORTCUTS.undo),
                mac
                    ? line("Redo", SHORTCUTS.redo)
                    : line("Redo", SHORTCUTS.redo, "Ctrl+Y"),
                line("Save now", SHORTCUTS.save),
            ],
        },
        {
            name: "View",
            shortcuts: [
                line("Zoom in", "+"),
                line("Zoom out", "-"),
                line("Fit the diagram", "0"),
                line("Open these keyboard shortcuts", SHORTCUTS.shortcuts),
            ],
        },
    ];
}
