/**
 * The target menu: what the diagrams page does with an activation (spec
 * 6.1). The engine never navigates; it reports an element or relationship
 * and where, and this follows its one target or offers several in a small
 * menu at that anchor, built from the vanilla `menu` component outside the
 * island.
 *
 * The menu is a list of entries labeled by view title, "Documentation",
 * "Decisions" or the link's host and property name. Arrows walk it, Enter
 * chooses, and Escape or a click outside closes it. Escape gives focus back
 * to what opened it, so a keyboard reader carries on from the same item.
 */

import type { Anchor } from "../engine/contract";
import type { Target } from "../model";
import Component from "./_component";
import Menu from "./menu";
import styles from "./target-menu.module.css";

type Entry = { id: string; title: string; selectable: false };

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

export default class TargetMenu extends Component {
    readonly #follow: (target: Target) => void;
    #menu: Menu<Entry> | null = null;
    #popup: HTMLElement | null = null;
    #opener: HTMLElement | null = null;

    constructor(element: HTMLElement, follow: (target: Target) => void) {
        super(element);
        this.#follow = follow;
    }

    get isOpen() {
        return this.#popup !== null;
    }

    /** Follow the one target, offer several, and do nothing for none. */
    activate(targets: Target[], anchor: Anchor) {
        this.close(false);
        if (targets.length === 0) return;
        if (targets.length === 1) {
            this.#follow(targets[0]);
            return;
        }
        this.#open(targets, anchor);
    }

    #open(targets: Target[], anchor: Anchor) {
        if (!this.element) return;
        const active = this.element.ownerDocument.activeElement;
        this.#opener = active instanceof HTMLElement ? active : null;

        const popup = document.createElement("div");
        popup.dataset.targetMenu = "";
        popup.className = styles.popup;
        place(popup, anchor.x, anchor.y);
        this.element.appendChild(popup);
        this.#popup = popup;

        // Each entry is an action: the menu reports the choice and paints
        // none as selected. It stays a list on every screen width, where the
        // narrow layout would turn a menu into a <select>.
        const entries: Entry[] = targets.map((target, index) => ({
            id: `target-${index}`,
            title: target.label,
            selectable: false,
        }));
        const menu = new Menu<Entry>(popup, entries, "wide");
        menu.onSelectionChange((entry) => {
            const target = targets[entries.indexOf(entry)];
            if (!target) return;
            this.close(false);
            this.#follow(target);
        });
        menu.render();
        this.#menu = menu;

        popup.querySelector("ul")?.setAttribute("role", "menu");
        for (const item of popup.querySelectorAll("li")) {
            item.setAttribute("role", "none");
        }
        for (const link of this.#entries()) {
            link.setAttribute("role", "menuitem");
        }

        this.#keepOnScreen(popup, anchor);
        document.addEventListener("keydown", this.#onKeyDown);
        document.addEventListener("pointerdown", this.#onPointerDown);
        this.#entries()[0]?.focus();
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
        if (this.#popup?.contains(event.target as Node)) return;
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
    }

    render() {
        this.clear();
    }

    clear() {
        this.close(false);
    }
}
