import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import styles from "./current-view.module.css";

export default class CurrentView {
    #el: HTMLElement | null = null;
    #diagram: Diagram;

    constructor(el: HTMLElement, diagram: Diagram) {
        this.#el = el;
        this.#diagram = diagram;
        this.render();
    }

    #addControlButtons(container: HTMLElement) {
        const buttons = document.createElement("div");
        buttons.classList.add(styles.controlButtons);

        // TODO: Check if current view has animations
        // Set button controls for animations
        // TODO: button for dark mode
        // TODO: Toggle descriptions/technologies
        // TODO: reset zoom controls

        container?.appendChild(buttons);
    }

    render(currentView: View | null = null, element?: Record<string, unknown>) {
        if (!this.#el || !currentView) return;
        const [description, author] = currentView.description.split("Author: ");
        this.#el.classList.add(styles.currentView);

        this.#el.innerHTML = `
            <div class="${styles.description}">
                <h2>[${currentView.type}] ${element?.name || currentView.key}${currentView.environment ? ` - ${currentView.environment}` : ""}</h2>
                <p>${description || "(no description)"}</p>
                ${
                    author
                        ? `<small>Author: ${author.replace(/(.*)<(.+@.+)>/, `<a href="mailto:$2">$1</a>`)}</small>`
                        : ""
                }
            </div>
        `;

        const controlButtonsContainer = document.createElement("div");
        this.#addControlButtons(controlButtonsContainer);
        this.#el.appendChild(controlButtonsContainer);
    }
}
