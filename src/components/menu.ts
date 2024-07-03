import Component from "./_component";
import styles from "./menu.module.css";

type MenuItem = { id: string; title: string };

export default class Menu<Item extends MenuItem> extends Component {
    #items: Item[];
    #orientation: "landscape" | "portrait" | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #callbacks = new Map<string, (item: Item) => void>();
    #selectedItem: Item | null = null;

    constructor(element: HTMLElement, menuItems: Item[]) {
        super(element);
        this.#items = menuItems;
    }

    #textContentFn = (item: Item) => `${item.title}`;

    #clearMenu() {
        if (this.#orientation === "portrait") {
            const select = this.element?.querySelector("select");
            if (select) {
                select.removeEventListener(
                    "change",
                    this.#eventHandler.bind(this),
                );
            }
        } else {
            const list = this.element?.querySelectorAll("ul > li > a");
            if (list) {
                for (const item of Array.from(list)) {
                    item.removeEventListener(
                        "click",
                        this.#eventHandler.bind(this),
                    );
                }
            }
        }

        if (this.element?.childNodes.length) {
            for (const child of Array.from(this.element?.childNodes)) {
                this.element?.removeChild(child);
            }
        }
    }

    #renderLandscapeMenu() {
        this.#orientation = "landscape";
        this.#clearMenu();

        const list = document.createElement("ul");

        for (const element of this.#items) {
            const item = document.createElement("li");
            const link = document.createElement("a");

            link.dataset.itemId = `${element.id}`;
            link.href = "#";
            link.textContent = this.#textContentFn(element);
            item.appendChild(link);
            list.appendChild(item);

            item.addEventListener("click", this.#eventHandler.bind(this));
        }

        this.element?.appendChild(list);
    }

    #renderPortraitMenu() {
        this.#orientation = "portrait";
        this.#clearMenu();

        const list = document.createElement("select");

        for (const element of this.#items) {
            const item = document.createElement("option");

            item.value = `${element.id}`;
            item.textContent = this.#textContentFn(element);
            list.appendChild(item);
        }

        list.addEventListener("change", this.#eventHandler.bind(this));

        this.element?.appendChild(list);
    }

    #eventHandler(event: Event) {
        event.preventDefault();

        let selectedItem: Item | undefined;
        if (this.#orientation === "portrait") {
            const target = event.target as HTMLSelectElement;
            selectedItem = this.#items.find((item) => item.id === target.value);
        } else {
            const target = event.target as HTMLAnchorElement;
            selectedItem = this.#items.find(
                (item) => item.id === target.dataset?.itemId,
            );
        }

        if (selectedItem) {
            this.setActive(selectedItem);
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

    setActive(item: Item | null = this.#selectedItem) {
        if (!item) return;

        this.#selectedItem = item;

        if (this.#orientation === "portrait") {
            const select = this.element?.querySelector("select");
            if (!select) return;

            select.value = item.id;
        } else {
            const list =
                this.element?.querySelectorAll<HTMLAnchorElement>(
                    "ul > li > a",
                );

            if (!list) return;

            for (const element of Array.from(list)) {
                if (element.dataset.itemId === item.id) {
                    element.classList.add(styles.active);
                } else {
                    element.classList.remove(styles.active);
                }
            }
        }

        this.#emitItemSelection(item);
    }

    onSelectionChange(callback: (item: Item) => void) {
        this.#callbacks.set(callback.name, callback);
    }

    // TODO: Think about how to render groups of items (separate by group)
    render() {
        if (!this.element) return;
        this.element.classList.add(styles.menu);
        this.#resizeObserver = new ResizeObserver(() => {
            if (!this.element) return;

            const orientationLandscape = window?.matchMedia(
                "(orientation: landscape)",
            );
            if (orientationLandscape.matches) {
                if (this.#orientation !== "landscape") {
                    this.#renderLandscapeMenu();
                }
            } else {
                if (this.#orientation !== "portrait") {
                    this.#renderPortraitMenu();
                }
            }

            this.setActive();
        });

        this.#resizeObserver.observe(this.element!);
    }

    clear() {
        this.#resizeObserver?.disconnect();
        this.#clearMenu();
    }
}
