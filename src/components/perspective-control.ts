/**
 * The perspective control: a button in the view toolbar, after the label
 * toggles, that opens the popup menu the target menu uses, with "No
 * perspective" first and then the names the view draws, sorted. While a
 * perspective is on, the button shows pressed, with filled binoculars and
 * the title `Perspective: <name>`. It hides in a view that carries none,
 * which includes Mermaid diagrams and image views.
 *
 *     const control = new PerspectiveControl((name) => follower.pick(name));
 *     control.mount(toolbar);
 *     control.show(names, selected);
 *     const stop = onPerspectiveKey(() => control.open());
 *
 * `Alt+P` opens the menu, by physical key, wherever focus is but in a field
 * that takes typing. The button's title names the key. The control holds
 * no choice of its own: the page writes the pick to the address and shows
 * it back.
 */

import perspectiveIcon from "bootstrap-icons/icons/binoculars.svg?raw";
import perspectiveOnIcon from "bootstrap-icons/icons/binoculars-fill.svg?raw";
import styles from "./current-view.module.css";
import PopupMenu from "./popup-menu";
import { type KeyPress, notation, SHORTCUTS, typesText } from "./shortcuts";

/** What the menu's first entry says, which switches the perspective off. */
export const NO_PERSPECTIVE = "No perspective";

/** Where the menu opens below the button. */
const GAP = 4;

/**
 * Whether `event` presses `Alt+P`, by physical key, so the character
 * Option+P types on macOS doesn't get in the way.
 */
export function isPerspectiveKey(event: Partial<KeyPress>): boolean {
    return (
        event.code === "KeyP" &&
        event.altKey === true &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
    );
}

/**
 * Run `open` on every `Alt+P` the page hears outside a field that takes
 * typing. Returns what stops listening.
 */
export function onPerspectiveKey(open: () => void): () => void {
    const onKey = (event: KeyboardEvent) => {
        if (!isPerspectiveKey(event) || typesText(event.target)) return;
        event.preventDefault();
        open();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
}

export default class PerspectiveControl {
    readonly #pick: (name: string | null) => void;
    #group: HTMLElement | null = null;
    #names: readonly string[] = [];
    #selected: string | null = null;
    #popup: PopupMenu | null = null;

    /** A control that reports each pick, a name or none, to `pick`. */
    constructor(pick: (name: string | null) => void) {
        this.#pick = pick;
    }

    /**
     * Put the button in `toolbar`, after its label toggles, painted as it
     * was last shown. The toolbar draws itself again on every view, so it
     * mounts the control each time.
     */
    mount(toolbar: HTMLElement) {
        this.close(false);
        this.#group?.remove();
        const group = document.createElement("div");
        group.className = `perspective-buttons ${styles.btnGroup}`;
        const button = document.createElement("button");
        button.className = "perspective";
        button.setAttribute("aria-haspopup", "menu");
        button.addEventListener("click", () => this.#toggle());
        group.appendChild(button);
        const labels = toolbar.querySelector(".actions");
        toolbar.insertBefore(
            group,
            labels ? labels.nextSibling : toolbar.firstChild,
        );
        this.#group = group;
        this.#paint();
    }

    /**
     * Show the names the view draws, and `selected`, the name the address
     * holds: the button hides for no names and shows pressed while the
     * view draws `selected`.
     */
    show(names: readonly string[], selected: string | null) {
        this.#names = names;
        this.#selected = selected;
        if (this.#popup?.isOpen) this.close(false);
        this.#paint();
    }

    /** Show `selected` as the name the address holds, with the same names. */
    select(selected: string | null) {
        this.show(this.#names, selected);
    }

    /** The name the view draws under, or `null`. */
    #on(): string | null {
        return this.#selected !== null && this.#names.includes(this.#selected)
            ? this.#selected
            : null;
    }

    #button(): HTMLButtonElement | null {
        return this.#group?.querySelector("button") ?? null;
    }

    #paint() {
        const group = this.#group;
        const button = this.#button();
        if (!group || !button) return;
        group.hidden = this.#names.length === 0;
        const on = this.#on();
        const key = notation(SHORTCUTS.perspective);
        const label = on
            ? `Perspective: ${on} (${key})`
            : `Perspectives (${key})`;
        button.innerHTML = on ? perspectiveOnIcon : perspectiveIcon;
        button.dataset.active = on ? "true" : "";
        button.setAttribute("aria-pressed", String(on !== null));
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    #toggle() {
        if (this.#popup?.isOpen) this.close(true);
        else this.open();
    }

    /** Open the menu under the button, while the button shows. */
    open() {
        const button = this.#button();
        if (!button || this.#group?.hidden) return;
        const on = this.#on();
        const choices: (string | null)[] = [null, ...this.#names];
        const box = button.getBoundingClientRect();
        this.#popup ??= new PopupMenu(document.body, "perspective-menu");
        this.#popup.open(
            choices.map((name) => ({
                label: name ?? NO_PERSPECTIVE,
                checked: name === on,
            })),
            { x: box.left, y: box.bottom + GAP },
            (index) => this.#pick(choices[index] ?? null),
            { opener: button },
        );
    }

    /** Close the menu, giving focus back to the button when asked. */
    close(restoreFocus = true) {
        this.#popup?.close(restoreFocus);
    }

    /** Close the menu and take the button away. */
    clear() {
        this.close(false);
        this.#group?.remove();
        this.#group = null;
    }
}
