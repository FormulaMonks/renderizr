import Component from "./_component";
import styles from "./menu.module.css";

type MenuItem = {
    id: string;
    title: string;
    items?: MenuItem[];
    /**
     * When `false` the entry still emits a selection event but never becomes
     * the menu's selection, and it is left out of the mobile `<select>`. Used
     * for the documentation's "on this page" anchors, which scroll the current
     * page rather than navigating to another one.
     */
    selectable?: boolean;
};

type Orientation = "wide" | "narrow";

type BoundListener = {
    target: EventTarget;
    type: string;
    handler: EventListener;
};

export default class Menu<Item extends MenuItem> extends Component {
    #items: Item[];
    #orientation: Orientation | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #callbacks = new Map<string, (item: Item) => void>();
    #selectedItem: Item | null = null;
    #highlightedId: string | null = null;
    #listeners: BoundListener[] = [];

    constructor(element: HTMLElement, menuItems: Item[]) {
        super(element);
        this.#items = menuItems;
    }

    #textContentFn = (item: Item) => `${item.title}`;

    #addListener(target: EventTarget, type: string, handler: EventListener) {
        target.addEventListener(type, handler);
        this.#listeners.push({ target, type, handler });
    }

    #removeListeners() {
        for (const { target, type, handler } of this.#listeners) {
            target.removeEventListener(type, handler);
        }
        this.#listeners = [];
    }

    #clearMenu() {
        this.#removeListeners();

        if (this.element?.childNodes.length) {
            for (const child of Array.from(this.element.childNodes)) {
                this.element.removeChild(child);
            }
        }
    }

    /** Entries can be nested, so lookups have to walk the whole tree. */
    #findItem(id: string, items: Item[] = this.#items): Item | null {
        for (const item of items) {
            if (item.id === id) return item;

            const nested = item.items as Item[] | undefined;
            if (nested?.length) {
                const found = this.#findItem(id, nested);
                if (found) return found;
            }
        }

        return null;
    }

    #ancestorIds(
        id: string,
        items: Item[] = this.#items,
        trail: string[] = [],
    ): string[] | null {
        for (const item of items) {
            if (item.id === id) return trail;

            const nested = item.items as Item[] | undefined;
            if (nested?.length) {
                const found = this.#ancestorIds(id, nested, [
                    ...trail,
                    item.id,
                ]);
                if (found) return found;
            }
        }

        return null;
    }

    /**
     * Always canceled: the router lives in the URL hash, so letting a
     * `href="#id"` through would throw the reader off the current page.
     */
    #onLinkClick = (event: Event) => {
        event.preventDefault();

        const target = (event.currentTarget ??
            event.target) as HTMLAnchorElement;
        const item = this.#findItem(target.dataset?.itemId ?? "");

        if (item) this.setActive(item);
    };

    #onSelectChange = (event: Event) => {
        const target = event.target as HTMLSelectElement;
        const item = this.#findItem(target.value);

        if (item) this.setActive(item);
    };

    #renderList(container: HTMLElement, items: Item[], depth: number) {
        const list = document.createElement("ul");
        list.dataset.depth = `${depth}`;

        for (const item of items) {
            const listItem = document.createElement("li");
            const link = document.createElement("a");

            link.dataset.itemId = `${item.id}`;
            link.dataset.depth = `${depth}`;
            link.href = `#${item.id}`;
            link.textContent = this.#textContentFn(item);

            listItem.appendChild(link);
            list.appendChild(listItem);

            this.#addListener(link, "click", this.#onLinkClick);

            const nested = item.items as Item[] | undefined;
            if (nested?.length) {
                this.#renderList(listItem, nested, depth + 1);
            }
        }

        container.appendChild(list);
    }

    #appendOptions(select: HTMLSelectElement, items: Item[], depth: number) {
        for (const item of items) {
            // Anchors into the page being read are not destinations; on a
            // narrow screen they would only make the list harder to use.
            if (item.selectable === false) continue;

            const option = document.createElement("option");
            // Non-breaking spaces: browsers collapse regular ones in options.
            const indent = "   ".repeat(depth);

            option.value = `${item.id}`;
            option.textContent = `${indent}${depth > 0 ? "· " : ""}${this.#textContentFn(item)}`;
            select.appendChild(option);

            const nested = item.items as Item[] | undefined;
            if (nested?.length) {
                this.#appendOptions(select, nested, depth + 1);
            }
        }
    }

    #renderMenu(orientation: Orientation) {
        if (!this.element) return;

        // Rebuilding the list must not throw away where the reader had
        // scrolled the sidebar to.
        const { scrollTop } = this.element;

        this.#orientation = orientation;
        this.#clearMenu();

        if (orientation === "narrow") {
            const select = document.createElement("select");
            this.#appendOptions(select, this.#items, 0);
            this.#addListener(select, "change", this.#onSelectChange);
            this.element.appendChild(select);
        } else {
            this.#renderList(this.element, this.#items, 0);
        }

        this.element.scrollTop = scrollTop;
        this.#paint();
    }

    #matchOrientation(): Orientation {
        // Width, not orientation: a phone held sideways is still a phone, and
        // a tall desktop window still has room for a sidebar.
        return window?.matchMedia("(min-width: 900px)").matches
            ? "wide"
            : "narrow";
    }

    /** Repaint the current selection and highlight, emitting nothing. */
    #paint() {
        if (!this.element) return;

        if (this.#orientation === "narrow") {
            const select = this.element.querySelector("select");
            if (select && this.#selectedItem) {
                select.value = this.#selectedItem.id;
            }
            return;
        }

        const anchors =
            this.element.querySelectorAll<HTMLAnchorElement>("a[data-item-id]");
        const ancestors = this.#selectedItem
            ? this.#ancestorIds(this.#selectedItem.id)
            : null;
        const trail = new Set(ancestors ?? []);

        for (const anchor of anchors) {
            const id = anchor.dataset.itemId ?? "";
            const isActive = id === this.#selectedItem?.id;

            anchor.classList.toggle(styles.active, isActive);
            anchor.classList.toggle(styles.activeTrail, trail.has(id));
            anchor.classList.toggle(styles.current, id === this.#highlightedId);

            if (isActive) anchor.setAttribute("aria-current", "true");
            else anchor.removeAttribute("aria-current");
        }
    }

    #emitItemSelection(item: Item) {
        for (const callback of this.#callbacks.values()) {
            callback(item);
        }
    }

    setTextContentFn(fn: (item: Item) => string) {
        this.#textContentFn = fn;
    }

    /** Replace the rendered entries, keeping the current selection. */
    setItems(items: Item[]) {
        this.#items = items;
        if (this.#orientation) this.#renderMenu(this.#orientation);
    }

    setActive(item: Item | null = this.#selectedItem) {
        if (!item) return;

        // Non-selectable entries are actions, not destinations: they report
        // the click and leave the selection where it was.
        if (item.selectable === false) {
            this.#paint();
            this.#emitItemSelection(item);
            return;
        }

        this.#selectedItem = item;
        this.#paint();
        this.#emitItemSelection(item);
    }

    /** Highlight an entry without selecting it; used by the scroll spy. */
    setHighlighted(id: string | null) {
        if (this.#highlightedId === id) return;

        this.#highlightedId = id;
        this.#paint();
    }

    getSelected(): Item | null {
        return this.#selectedItem;
    }

    onSelectionChange(callback: (item: Item) => void) {
        this.#callbacks.set(callback.name, callback);
    }

    render() {
        if (!this.element) return;

        this.element.classList.add(styles.menu);
        // Built here and now: callers used to have to guess how long the
        // resize observer would take before `setActive` had anything to paint.
        this.#renderMenu(this.#matchOrientation());

        this.#resizeObserver = new ResizeObserver(() => {
            const orientation = this.#matchOrientation();
            // Only a change of shape rebuilds, and rebuilding repaints rather
            // than re-selecting — a resize is not a navigation.
            if (orientation !== this.#orientation) {
                this.#renderMenu(orientation);
            }
        });

        this.#resizeObserver.observe(this.element);
    }

    clear() {
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = null;
        this.#clearMenu();
        this.#orientation = null;
        this.#selectedItem = null;
        this.#highlightedId = null;
    }
}
