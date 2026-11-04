/**
 * A small menu of actions at an anchor on screen, built from the vanilla
 * `menu` component: the card the target menu and the perspective control
 * open. Arrows walk it, Enter chooses, and Escape, Tab or a click outside
 * closes it. Escape gives focus back to what opened it, so a keyboard
 * reader carries on from there.
 *
 *     const popup = new PopupMenu(host, "target-menu");
 *     popup.open([{ label: "Documentation" }], { x, y }, (index) => ...);
 *
 * An entry with `checked` reads as a radio item, checked or not.
 */

import type { Anchor } from "../engine/contract";
import Component from "./_component";
import Menu from "./menu";
import styles from "./popup-menu.module.css";

/** One entry: its label, and whether it is the one chosen, for a radio. */
export type PopupEntry = { label: string; checked?: boolean };

/** What an open popup may take besides its entries. */
export type PopupOptions = {
    /**
     * What opened the menu, which Escape gives focus back to and a click
     * on which leaves the menu to its owner; the focused element when none.
     */
    opener?: HTMLElement | null;
};

type Item = { id: string; title: string; selectable: false };

/** Where the menu keeps from the viewport's edges when it would spill. */
const EDGE = 8;

/**
 * Put the menu at `x`, `y` on screen. The stylesheet positions it from two
 * custom properties, set through the CSSOM as `main.ts` sets
 * `--header-height`, which a strict CSP allows.
 */
function place(popup: HTMLElement, x: number, y: number) {
    popup.style.setProperty("--menu-x", `${x}px`);
    popup.style.setProperty("--menu-y", `${y}px`);
}

/** What the open menu shows, which `render()` draws from. */
type Shown = {
    entries: readonly PopupEntry[];
    anchor: Anchor;
    choose: (index: number) => void;
    opener: HTMLElement | null;
    keep: HTMLElement | null;
};

export default class PopupMenu extends Component {
    readonly #marker: string;
    #shown: Shown | null = null;
    #menu: Menu<Item> | null = null;
    #popup: HTMLElement | null = null;

    /**
     * A menu that opens inside `host`, marked with the attribute
     * `data-<marker>`.
     */
    constructor(host: HTMLElement, marker: string) {
        super(host);
        this.#marker = marker;
    }

    get isOpen() {
        return this.#popup !== null;
    }

    /**
     * Open the menu of `entries` at `anchor`, in place of any open one;
     * `choose` hears the index of the entry the reader picks, after the
     * menu closes.
     */
    open(
        entries: readonly PopupEntry[],
        anchor: Anchor,
        choose: (index: number) => void,
        { opener }: PopupOptions = {},
    ) {
        this.close(false);
        const active = this.element?.ownerDocument.activeElement;
        this.#shown = {
            entries,
            anchor,
            choose,
            opener: opener ?? (active instanceof HTMLElement ? active : null),
            keep: opener ?? null,
        };
        this.render();
    }

    /** Draw the menu `open` was given, if it is still open. */
    render() {
        const shown = this.#shown;
        this.clear();
        if (!shown || !this.element) return;
        this.#shown = shown;
        const { entries, anchor, choose } = shown;

        const popup = document.createElement("div");
        popup.setAttribute(`data-${this.#marker}`, "");
        popup.className = styles.popup;
        place(popup, anchor.x, anchor.y);
        this.element.appendChild(popup);
        this.#popup = popup;

        // Each entry is an action: the menu reports the choice and paints
        // none as selected. It stays a list on every screen width, where the
        // narrow layout would turn a menu into a <select>.
        const items: Item[] = entries.map((entry, index) => ({
            id: `${this.#marker}-${index}`,
            title: entry.label,
            selectable: false,
        }));
        const menu = new Menu<Item>(popup, items, "wide");
        menu.onSelectionChange((item) => {
            const index = items.indexOf(item);
            if (index < 0) return;
            this.close(false);
            choose(index);
        });
        menu.render();
        this.#menu = menu;

        popup.querySelector("ul")?.setAttribute("role", "menu");
        for (const item of popup.querySelectorAll("li")) {
            item.setAttribute("role", "none");
        }
        const links = this.#entries();
        for (const [index, entry] of entries.entries()) {
            const link = links[index];
            if (!link) continue;
            if (entry.checked === undefined) {
                link.setAttribute("role", "menuitem");
                continue;
            }
            link.setAttribute("role", "menuitemradio");
            link.setAttribute("aria-checked", String(entry.checked));
        }

        this.#keepOnScreen(popup, anchor);
        document.addEventListener("keydown", this.#onKeyDown);
        document.addEventListener("pointerdown", this.#onPointerDown);
        const checked = entries.findIndex((entry) => entry.checked);
        links[Math.max(0, checked)]?.focus();
    }

    #entries(): HTMLElement[] {
        return Array.from(
            this.#popup?.querySelectorAll<HTMLElement>("a[data-item-id]") ?? [],
        );
    }

    /** Shift the menu back inside the viewport when it would spill out. */
    #keepOnScreen(popup: HTMLElement, anchor: Anchor) {
        const box = popup.getBoundingClientRect();
        const right = window.innerWidth - EDGE;
        const bottom = window.innerHeight - EDGE;
        const x =
            box.width > 0 && anchor.x + box.width > right
                ? Math.max(EDGE, right - box.width)
                : anchor.x;
        const y =
            box.height > 0 && anchor.y + box.height > bottom
                ? Math.max(EDGE, bottom - box.height)
                : anchor.y;
        place(popup, x, y);
    }

    #onKeyDown = (event: KeyboardEvent) => {
        const entries = this.#entries();
        const at = entries.indexOf(document.activeElement as HTMLElement);
        switch (event.key) {
            case "Escape":
                event.preventDefault();
                this.close(true);
                return;
            case "ArrowDown":
                event.preventDefault();
                entries[(at + 1) % entries.length]?.focus();
                return;
            case "ArrowUp":
                event.preventDefault();
                entries[(at - 1 + entries.length) % entries.length]?.focus();
                return;
            case "Tab":
                // Leaving the menu by Tab closes it, as any menu does.
                this.close(false);
                return;
        }
    };

    #onPointerDown = (event: Event) => {
        const target = event.target as Node;
        if (this.#popup?.contains(target)) return;
        if (this.#shown?.keep?.contains(target)) return;
        this.close(false);
    };

    /** Close the menu, giving focus back to its opener when asked. */
    close(restoreFocus = true) {
        if (!this.#popup) return;
        const opener = this.#shown?.opener ?? null;
        this.clear();
        if (restoreFocus) opener?.focus();
    }

    /** Take the menu off the page, with its listeners. */
    clear() {
        document.removeEventListener("keydown", this.#onKeyDown);
        document.removeEventListener("pointerdown", this.#onPointerDown);
        this.#menu?.clear();
        this.#menu = null;
        this.#popup?.remove();
        this.#popup = null;
        this.#shown = null;
    }
}
