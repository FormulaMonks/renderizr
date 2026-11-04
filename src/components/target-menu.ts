/**
 * The target menu: what the diagrams page does with an activation (spec
 * 6.1). The engine never navigates; it reports an element or relationship
 * and where, and this follows its one target or offers several in a small
 * menu at that anchor, the popup menu built from the vanilla `menu`
 * component outside the island.
 *
 * The menu is a list of entries labeled by view title, "Documentation",
 * "Decisions" or the link's host and property name. Arrows walk it, Enter
 * chooses, and Escape or a click outside closes it. Escape gives focus back
 * to what opened it, so a keyboard reader carries on from the same item.
 */

import type { Anchor } from "../engine/contract";
import type { Target } from "../model";
import Component from "./_component";
import PopupMenu from "./popup-menu";

export default class TargetMenu extends Component {
    readonly #follow: (target: Target) => void;
    #popup: PopupMenu | null = null;

    constructor(element: HTMLElement, follow: (target: Target) => void) {
        super(element);
        this.#follow = follow;
    }

    get isOpen() {
        return this.#popup?.isOpen ?? false;
    }

    /** Follow the one target, offer several, and do nothing for none. */
    activate(targets: Target[], anchor: Anchor) {
        this.close(false);
        if (targets.length === 0) return;
        if (targets.length === 1) {
            this.#follow(targets[0]);
            return;
        }
        if (!this.element) return;
        this.#popup ??= new PopupMenu(this.element, "target-menu");
        this.#popup.open(
            targets.map((target) => ({ label: target.label })),
            anchor,
            (index) => this.#follow(targets[index]),
        );
    }

    /** Close the menu, giving focus back to its opener when asked. */
    close(restoreFocus = true) {
        this.#popup?.close(restoreFocus);
    }

    render() {
        this.clear();
    }

    clear() {
        this.close(false);
    }
}
