import { applyTheme, writeSetting } from "../storage";
import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import styles from "./current-view.module.css";
import lightModeIcon from "../../vendor/structurizr/bootstrap-icons/moon-fill.svg?raw";
import darkModeIcon from "../../vendor/structurizr/bootstrap-icons/sun-fill.svg?raw";
import toggleDescriptionsIcon from "../../vendor/structurizr/bootstrap-icons/card-text.svg?raw";
import toggleTechnologiesIcon from "../../vendor/structurizr/bootstrap-icons/code-square.svg?raw";
import resetZoomIcon from "../../vendor/structurizr/bootstrap-icons/aspect-ratio.svg?raw";
import zoomInIcon from "../../vendor/structurizr/bootstrap-icons/zoom-in.svg?raw";
import zoomOutIcon from "../../vendor/structurizr/bootstrap-icons/zoom-out.svg?raw";
import playIcon from "../../vendor/structurizr/bootstrap-icons/play-fill.svg?raw";
import stopIcon from "../../vendor/structurizr/bootstrap-icons/stop-fill.svg?raw";
import prevStepIcon from "../../vendor/structurizr/bootstrap-icons/skip-start-fill.svg?raw";
import nextStepIcon from "../../vendor/structurizr/bootstrap-icons/skip-end-fill.svg?raw";
import Component from "./_component";

export type DiagramControls = {
    /** Return the diagram to the size the page chose for it. */
    fit: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
};

export default class CurrentView extends Component {
    #diagram: Diagram;
    #controls: DiagramControls;

    #actions = new Map([
        ["zoom-in", () => this.#controls.zoomIn()],
        ["zoom-out", () => this.#controls.zoomOut()],
        ["reset-zoom", () => this.#controls.fit()],
        [
            "dark-mode",
            (event: Event) => {
                const isDarkMode = this.#diagram.isDarkMode();
                this.#diagram.setDarkMode(!isDarkMode);
                applyTheme(!isDarkMode);
                writeSetting(
                    "structurizr_cooper:darkModeDiagrams",
                    !isDarkMode ? "dark" : "light",
                );
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
        element: HTMLElement,
        diagram: Diagram,
        controls: DiagramControls,
    ) {
        super(element);
        this.#diagram = diagram;
        this.#controls = controls;
    }

    #toggleBackButton() {
        if (this.#diagram.animationStarted()) {
            const button = this.element?.querySelector(
                ".prev-step",
            ) as HTMLButtonElement;
            button.disabled = false;
        } else {
            const button = this.element?.querySelector(
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
                <button class="zoom-out" title="Zoom out" aria-label="Zoom out">${zoomOutIcon}</button>
                <button class="zoom-in" title="Zoom in" aria-label="Zoom in">${zoomInIcon}</button>
                <button class="reset-zoom" title="Fit diagram" aria-label="Fit diagram">${resetZoomIcon}</button>
                <button class="dark-mode" title="Toggle ${isDarkMode ? "light" : "dark"} diagram" aria-label="Toggle ${isDarkMode ? "light" : "dark"} diagram">${isDarkMode ? darkModeIcon : lightModeIcon}</button>
                <button class="toggle-description" title="Toggle descriptions" aria-label="Toggle descriptions">${toggleDescriptionsIcon}</button>
                <button class="toggle-technologies" title="Toggle technologies" aria-label="Toggle technologies">${toggleTechnologiesIcon}</button>
            </div>
            ${
                hasAnimations
                    ? `
            <div class="animation-buttons ${styles.btnGroup}">
                <button class="prev-step" disabled="true" title="Previous step" aria-label="Previous step">${prevStepIcon}</button>
                <button class="play-animation" title="Play animation" aria-label="Play animation">${playIcon}</button>
                <button class="next-step" title="Next step" aria-label="Next step">${nextStepIcon}</button>
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
        const container = this.element?.querySelector(
            `${styles.controlButtons}`,
        );
        for (const [id, action] of this.#actions) {
            const button = container?.querySelector(`.${id}`);
            button?.removeEventListener("click", action);
        }

        const children = this.element?.querySelectorAll("*");
        if (children) {
            for (const child of Array.from(children)) {
                child.remove();
            }
        }
    }

    render(
        currentView: View | null = null,
        _element?: Record<string, unknown>,
    ) {
        if (!this.element || !currentView) return;
        const [description, author] = (currentView.description ?? "").split(
            "Author: ",
        );
        // Structurizr's own naming: an explicit title when the view has one,
        // otherwise "[Container] Internet Banking System" and the like.
        const title = structurizr.ui.getTitleForView(currentView);
        const match = title.match(/^\[([^\]]+)\]\s*(.*)$/);
        const kind = match?.[1] ?? "";
        // A landscape view has no subject beyond its kind, so the kind is the
        // name and there is nothing left to badge.
        const name = match?.[2]?.trim() || (match ? "" : title);
        this.element.classList.add(styles.currentView);

        this.element.innerHTML = `
            <div class="${styles.description}">
                <h2>${name || kind}${kind && name ? `<span class="${styles.kind}">${kind}</span>` : ""}</h2>
                ${description ? `<p>${description}</p>` : ""}
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
        this.element.appendChild(controlButtonsContainer);
    }
}
