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

export default class PopupMenu {
    readonly #host: HTMLElement;
    readonly #marker: string;
    #menu: Menu<Item> | null = null;
    #popup: HTMLElement | null = null;
    #opener: HTMLElement | null = null;
    /** The opener given, a click on which leaves the menu to its owner. */
    #keep: HTMLElement | null = null;

    /**
     * A menu that opens inside `host`, marked with the attribute
     * `data-<marker>`.
     */
    constructor(host: HTMLElement, marker: string) {
        this.#host = host;
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
        const active = this.#host.ownerDocument.activeElement;
        this.#opener =
            opener ?? (active instanceof HTMLElement ? active : null);
        this.#keep = opener ?? null;

        const popup = document.createElement("div");
        popup.setAttribute(`data-${this.#marker}`, "");
        popup.className = styles.popup;
        place(popup, anchor.x, anchor.y);
        this.#host.appendChild(popup);
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
        entries.forEach((entry, index) => {
            const link = links[index];
            if (!link) return;
            if (entry.checked === undefined) {
                link.setAttribute("role", "menuitem");
                return;
            }
            link.setAttribute("role", "menuitemradio");
            link.setAttribute("aria-checked", String(entry.checked));
        });

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
        if (this.#keep?.contains(target)) return;
        this.close(false);
    };

    /** Close the menu, giving focus back to its opener when asked. */
    close(restoreFocus = true) {
        if (!this.#popup) return;
        document.removeEventListener("keydown", this.#onKeyDown);
        document.removeEventListener("pointerdown", this.#onPointerDown);
        this.#menu?.clear();
        this.#menu = null;
        this.#popup.remove();
        this.#popup = null;
        if (restoreFocus) this.#opener?.focus();
        this.#opener = null;
        this.#keep = null;
    }
}
