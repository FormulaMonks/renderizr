import type { View } from "../types/structurizr-workspace";
import styles from "./current-view.module.css";

export default class CurrentView {
    #el: HTMLElement | null = null;

    constructor(el: HTMLElement) {
        this.#el = el;
        this.render();
    }

    render(currentView: View | null = null, element?: Record<string, unknown>) {
        if (!this.#el || !currentView) return;
        const [description, author] = currentView.description.split("Author: ");

        this.#el.classList.add(styles.currentView);

        this.#el.innerHTML = `
            <h2>[${currentView.type}] ${element?.name || currentView.key}${currentView.environment ? ` - ${currentView.environment}` : ""}</h2>
            <p>${description || "(no description)"}</p>
            ${
                author
                    ? `<small>Author: ${author.replace(/(.*)<(.+@.+)>/, `<a href="mailto:$2">$1</a>`)}</small>`
                    : ""
            }
        `;
    }
}
