import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import type DraggableZone from "./draggable-zone";
import styles from "./current-view.module.css";
import lightModeIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/moon-fill.svg?raw";
import darkModeIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/sun-fill.svg?raw";
import toggleDescriptionsIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/card-text.svg?raw";
import toggleTechnologiesIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/code-square.svg?raw";
import resetZoomIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/search.svg?raw";
import playIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/play-fill.svg?raw";
import stopIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/stop-fill.svg?raw";
import prevStepIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/skip-start-fill.svg?raw";
import nextStepIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/skip-end-fill.svg?raw";
import Component from "./_component";

export default class CurrentView extends Component {
    #el: HTMLElement | null = null;
    #diagram: Diagram;
    #draggableZone: DraggableZone | null = null;

    #actions = new Map([
        ["reset-zoom", () => this.#draggableZone?.render()],
        [
            "dark-mode",
            (event: Event) => {
                this.#diagram.setDarkMode(!this.#diagram.isDarkMode());
                (event.target as HTMLButtonElement).innerHTML =
                    this.#diagram.isDarkMode() ? darkModeIcon : lightModeIcon;
                this.#diagram.stopAnimation();
                this.#toggleBackButton();
            },
        ],
        [
            "toggle-description",
            (event: Event) => {
                this.#diagram.toggleDescription();

                const button = event.target as HTMLButtonElement;
                if (button) {
                    button.dataset.active =
                        button.dataset.active === "true" ? "" : "true";
                }
                this.#diagram.stopAnimation();
                this.#toggleBackButton();
            },
        ],
        [
            "toggle-technologies",
            (event: Event) => {
                this.#diagram.toggleMetadata();

                const button = event.target as HTMLButtonElement;
                if (button) {
                    button.dataset.active =
                        button.dataset.active === "true" ? "" : "true";
                }
                this.#diagram.stopAnimation();
                this.#toggleBackButton();
            },
        ],
        [
            "play-animation",
            (event: Event) => {
                const button = event.target as HTMLButtonElement;
                if (button?.dataset.playing === "true") {
                    this.#diagram.stopAnimation();
                } else {
                    this.#diagram.startAnimation(true);
                }
                this.#toggleBackButton();
            },
        ],
        [
            "prev-step",
            () => {
                this.#diagram.stepBackwardInAnimation();
                this.#toggleBackButton();
            },
        ],
        [
            "next-step",
            () => {
                this.#diagram.stepForwardInAnimation();
                this.#toggleBackButton();
            },
        ],
    ]);

    constructor(
        el: HTMLElement,
        diagram: Diagram,
        draggableZone: DraggableZone,
    ) {
        super();
        this.#el = el;
        this.#diagram = diagram;
        this.#draggableZone = draggableZone;
        this.render();
    }

    #toggleBackButton() {
        if (this.#diagram.animationStarted()) {
            const button = this.#el?.querySelector(
                ".prev-step",
            ) as HTMLButtonElement;
            button.disabled = false;
        } else {
            const button = this.#el?.querySelector(
                ".prev-step",
            ) as HTMLButtonElement;

            if (button) button.disabled = true;
        }
    }

    #addControlButtons(container: HTMLElement) {
        const hasAnimations =
            this.#diagram.currentViewHasAnimation() ||
            this.#diagram.currentViewIsDynamic();

        const isDarkMode = this.#diagram.isDarkMode();

        container.innerHTML = `
            <div class="actions ${styles.btnGroup}">
                <button class="reset-zoom" title="Reset Zoom">${resetZoomIcon}</button>
                <button class="dark-mode" title="Toggle ${isDarkMode ? "Light" : "Dark"} Mode">${isDarkMode ? darkModeIcon : lightModeIcon}</button>
                <button class="toggle-description" title="Toggle Descriptions">${toggleDescriptionsIcon}</button>
                <button class="toggle-technologies" title="Toggle Technologies">${toggleTechnologiesIcon}</button>
            </div>
            ${
                hasAnimations
                    ? `
            <div class="animation-buttons ${styles.btnGroup}">
                <button class="prev-step" disabled="true" title="Previous Step">${prevStepIcon}</button>
                <button class="play-animation" title="Play Animation">${playIcon}</button>
                <button class="next-step" title="Next Step">${nextStepIcon}</button>
            </div>`
                    : ""
            }
        `;

        for (const [id, action] of this.#actions) {
            const button = container.querySelector(`.${id}`);
            button?.addEventListener("click", action);
        }

        this.#diagram.onAnimationStarted(() => {
            const button = container.querySelector(
                ".play-animation",
            ) as HTMLButtonElement;

            if (!button) return;

            button.innerHTML = stopIcon;
            button.dataset.playing = "true";
        });
        this.#diagram.onAnimationStopped(() => {
            const button = container.querySelector(
                ".play-animation",
            ) as HTMLButtonElement;

            if (!button) return;

            button.innerHTML = playIcon;
            button.dataset.playing = "";
        });
    }

    clear() {
        const container = this.#el?.querySelector(`${styles.controlButtons}`);
        for (const [id, action] of this.#actions) {
            const button = container?.querySelector(`.${id}`);
            button?.removeEventListener("click", action);
        }

        const children = this.#el?.querySelectorAll("*");
        if (children) {
            for (const child of Array.from(children)) {
                child.remove();
            }
        }
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
        controlButtonsContainer.classList.add(styles.controlButtons);
        this.#addControlButtons(controlButtonsContainer);
        this.#el.appendChild(controlButtonsContainer);
    }
}
