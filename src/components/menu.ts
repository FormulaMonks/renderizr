import Component from "./_component";
import styles from "./menu.module.css";

type MenuItem = {
    id: string;
    title: string;
    items?: MenuItem[];
};

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
            const list = this.element?.querySelectorAll("ul > li a");
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

    #recursiveRenderLandscapeMenu(container: HTMLElement, items: Item[]) {
        const subList = document.createElement("ul");

        for (const subElement of items!) {
            const subItem = document.createElement("li");
            const subLink = document.createElement("a");

            subLink.dataset.itemId = `${subElement.id}`;
            subLink.href = `#${subElement.id}`;
            subLink.textContent = this.#textContentFn(subElement as Item);
            subItem.appendChild(subLink);
            subList.appendChild(subItem);

            subLink.addEventListener("click", this.#eventHandler.bind(this));

            if (subElement.items?.length) {
                this.#recursiveRenderLandscapeMenu(
                    subItem,
                    subElement.items as Item[],
                );
            }
        }

        container.appendChild(subList);
    }

    #renderLandscapeMenu() {
        this.#orientation = "landscape";
        this.#clearMenu();

        this.#recursiveRenderLandscapeMenu(this.element!, this.#items);
    }

    #renderPortraitMenu() {
        this.#orientation = "portrait";
        this.#clearMenu();

        const list = document.createElement("select");

        for (const element of this.#items) {
            const item = document.createElement("option");

            // TODO: Add support for nested items on mobile

            item.value = `${element.id}`;
            item.textContent = this.#textContentFn(element);
            list.appendChild(item);
        }

        list.addEventListener("change", this.#eventHandler.bind(this));

        this.element?.appendChild(list);
    }

    #eventHandler(event: Event) {
        let selectedItem: Item | undefined;
        let alternateParent: Item | undefined;
        let target: HTMLSelectElement | HTMLAnchorElement;

        if (this.#orientation === "portrait") {
            target = event.target as HTMLSelectElement;
            selectedItem = this.#items.find(
                (item) => item.id === (target as HTMLSelectElement).value,
            );
        } else {
            target = event.target as HTMLAnchorElement;
            selectedItem = this.#items.find(
                (item) => item.id === target.dataset?.itemId,
            );

            const parent = target
                .closest("a + ul")
                ?.parentNode?.querySelector("a") as HTMLAnchorElement;

            if (parent) {
                const anchors =
                    parent.nextElementSibling?.querySelectorAll("a");
                if (anchors) {
                    Array.from(anchors).map((item: HTMLAnchorElement) =>
                        item.classList.remove(styles.active),
                    );
                }

                alternateParent = this.#items.find(
                    (item) => item.id === parent.dataset.itemId,
                );
            }
        }

        if (alternateParent !== this.#selectedItem || selectedItem) {
            event.preventDefault();
            this.setActive(alternateParent ?? selectedItem);
        }

        target.classList.add(styles.active);
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

            // this.setActive();
        });

        this.#resizeObserver.observe(this.element!);
    }

    clear() {
        this.#resizeObserver?.disconnect();
        this.#clearMenu();
    }
}
