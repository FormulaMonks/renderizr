import { readSetting, writeSetting } from "../storage";
import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import { getResolvedTheme, onThemeChange, type ResolvedTheme } from "./theme";
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

/* -------------------------------------------------------------------------
 * Diagram color scheme
 *
 * Deliberately *independent* of the page theme owned by `theme.ts`: a reader
 * can keep the documentation dark while diagrams stay light, or the other way
 * around. Resolution order:
 *
 *   1. An explicit choice made with the toolbar button (persisted forever).
 *   2. The legacy Structurizr key, migrated on first read so returning readers
 *      keep the setting they already had.
 *   3. The page's resolved theme, so a first visit looks coherent. While no
 *      explicit choice exists the diagram keeps following the page (and the
 *      OS, through `theme.ts`); the moment the reader toggles, it stops.
 *
 * The resolved value is mirrored onto `<html data-diagram-theme="light|dark">`
 * so the canvas backdrop can be styled without ever consulting the page theme.
 * ------------------------------------------------------------------------- */

export type DiagramTheme = ResolvedTheme;

export const DIAGRAM_THEME_STORAGE_KEY = "renderizr:diagram-theme";
const LEGACY_DIAGRAM_THEME_STORAGE_KEY = "structurizr_cooper:darkModeDiagrams";
const DIAGRAM_LABELS_STORAGE_KEY = "renderizr:diagram-labels";

/**
 * The diagram theme the reader explicitly picked, or `null` when they never
 * picked one. Callers read `null` as "still fair to follow the page theme".
 */
export function getStoredDiagramTheme(): DiagramTheme | null {
    const stored = readSetting(DIAGRAM_THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;

    // Migrate readers coming from the previous Structurizr-flavoured key.
    const legacy = readSetting(LEGACY_DIAGRAM_THEME_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark") {
        writeSetting(DIAGRAM_THEME_STORAGE_KEY, legacy);
        return legacy;
    }

    return null;
}

/** The color scheme diagrams should be drawn in right now. */
export function getDiagramTheme(): DiagramTheme {
    return getStoredDiagramTheme() ?? getResolvedTheme();
}

/** Records an explicit diagram color scheme choice. */
export function storeDiagramTheme(theme: DiagramTheme): void {
    writeSetting(DIAGRAM_THEME_STORAGE_KEY, theme);
    // Keep the legacy key in step for anything still reading it.
    writeSetting(LEGACY_DIAGRAM_THEME_STORAGE_KEY, theme);
}

/**
 * Mirrors the diagram color scheme onto `<html>` for CSS to pick up. Called
 * before the diagram is constructed so the canvas never flashes the wrong
 * backdrop on its way in.
 */
export function applyDiagramTheme(theme: DiagramTheme): void {
    document.documentElement.dataset.diagramTheme = theme;
}

/** Visibility of the optional labels Structurizr draws inside elements. */
type LabelState = {
    descriptions: boolean;
    technologies: boolean;
};

/**
 * `structurizr-diagram.js` initializes `descriptionEnabled` and
 * `metadataEnabled` to `true`, so a freshly constructed diagram shows both.
 */
const STRUCTURIZR_LABEL_DEFAULTS: LabelState = {
    descriptions: true,
    technologies: true,
};

function readLabelState(): LabelState {
    const raw = readSetting(DIAGRAM_LABELS_STORAGE_KEY);
    if (!raw) return { ...STRUCTURIZR_LABEL_DEFAULTS };

    try {
        const parsed = JSON.parse(raw) as Partial<LabelState>;
        return {
            descriptions:
                typeof parsed.descriptions === "boolean"
                    ? parsed.descriptions
                    : STRUCTURIZR_LABEL_DEFAULTS.descriptions,
            technologies:
                typeof parsed.technologies === "boolean"
                    ? parsed.technologies
                    : STRUCTURIZR_LABEL_DEFAULTS.technologies,
        };
    } catch {
        return { ...STRUCTURIZR_LABEL_DEFAULTS };
    }
}

function writeLabelState(state: LabelState): void {
    writeSetting(DIAGRAM_LABELS_STORAGE_KEY, JSON.stringify(state));
}

export default class CurrentView extends Component {
    #diagram: Diagram;
    #controls: DiagramControls;

    /**
     * What the reader wants to see. Lives on the component — which survives
     * the view changes that rebuild the toolbar — *and* in localStorage, which
     * survives a reload.
     */
    #labels: LabelState = readLabelState();

    /**
     * What the diagram is actually showing. `structurizr-diagram.js` exposes
     * no getter or setter for these flags — only `toggleDescription()` and
     * `toggleMetadata()` — and `changeView()` leaves them alone, so we mirror
     * them here and toggle only on a mismatch. That turns the toggles into
     * idempotent setters and stops the state from ever drifting or
     * double-flipping.
     */
    #appliedLabels: LabelState = { ...STRUCTURIZR_LABEL_DEFAULTS };

    #unsubscribeTheme: (() => void) | null = null;

    #actions = new Map<string, () => void>([
        ["zoom-in", () => this.#controls.zoomIn()],
        ["zoom-out", () => this.#controls.zoomOut()],
        ["reset-zoom", () => this.#controls.fit()],
        [
            "dark-mode",
            () =>
                this.applyColorScheme(
                    this.#diagram.isDarkMode() ? "light" : "dark",
                    true,
                ),
        ],
        [
            "toggle-description",
            () => this.#setLabels({ descriptions: !this.#labels.descriptions }),
        ],
        [
            "toggle-technologies",
            () => this.#setLabels({ technologies: !this.#labels.technologies }),
        ],
        [
            "play-animation",
            () => {
                const button = this.#button("play-animation");
                if (button?.dataset.playing === "true") {
                    this.#stopAnimation();
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

        // Seed the engine from the persisted preferences before anything is
        // drawn. Both are safe this early: `setDarkMode()` bails out of
        // `renderView()` while there is no current view, and the label flags
        // are re-read every time a view is drawn.
        this.applyColorScheme(getDiagramTheme());
        this.#syncLabels();

        // Until the reader makes a diagram-specific choice, diagrams follow
        // the page (and, through it, the OS). After that they never do again.
        this.#unsubscribeTheme = onThemeChange((resolved) => {
            if (getStoredDiagramTheme()) return;
            this.applyColorScheme(resolved);
        });
    }

    #button(name: string): HTMLButtonElement | null {
        return (
            this.element?.querySelector<HTMLButtonElement>(`.${name}`) ?? null
        );
    }

    #toggleBackButton() {
        const button = this.#button("prev-step");
        if (!button) return;

        button.disabled = !this.#diagram.animationStarted();
    }

    /**
     * `Diagram.stopAnimation()` reaches `currentView.type` through
     * `currentViewIsDynamic()`, so it throws outright when no view has been
     * rendered yet — which is exactly the state the constructor seeds in.
     */
    #stopAnimation() {
        if (!this.#diagram.getCurrentView()) return;
        this.#diagram.stopAnimation();
    }

    /**
     * Applies a diagram color scheme. Pass `persist` when it comes from the
     * reader clicking the toolbar button: that pins the choice, so later page
     * or OS theme changes leave diagrams alone.
     */
    applyColorScheme(theme: DiagramTheme, persist = false): void {
        if (persist) storeDiagramTheme(theme);
        applyDiagramTheme(theme);

        const darkMode = theme === "dark";
        if (this.#diagram.isDarkMode() !== darkMode) {
            // `setDarkMode()` re-renders the view, which invalidates any
            // animation in flight.
            this.#diagram.setDarkMode(darkMode);
            this.#stopAnimation();
        }

        this.#paintControlButtons();
        this.#toggleBackButton();
    }

    /**
     * Brings the diagram in line with the desired label visibility.
     *
     * `changeView()` does *not* reset `descriptionEnabled` / `metadataEnabled`
     * — they are closure-level flags only ever flipped by `toggle*()`, and the
     * renderer re-reads them at the end of every draw — so after the initial
     * reconciliation this is a no-op. Re-toggling blindly on each view change
     * would invert the state every time.
     */
    #syncLabels(): void {
        if (this.#appliedLabels.descriptions !== this.#labels.descriptions) {
            this.#diagram.toggleDescription();
            this.#appliedLabels.descriptions = this.#labels.descriptions;
        }

        if (this.#appliedLabels.technologies !== this.#labels.technologies) {
            this.#diagram.toggleMetadata();
            this.#appliedLabels.technologies = this.#labels.technologies;
        }
    }

    #setLabels(next: Partial<LabelState>) {
        this.#labels = { ...this.#labels, ...next };
        writeLabelState(this.#labels);

        this.#syncLabels();
        this.#paintControlButtons();

        this.#stopAnimation();
        this.#toggleBackButton();
    }

    #paintToggleButton(name: string, active: boolean, label: string) {
        const button = this.#button(name);
        if (!button) return;

        button.dataset.active = active ? "true" : "";
        button.setAttribute("aria-pressed", String(active));
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    /**
     * Repaints every stateful button from the tracked state. The toolbar is
     * rebuilt with `innerHTML` on each view change, so without this the
     * buttons would fall back to their default look while the diagram kept the
     * reader's actual settings.
     */
    #paintControlButtons() {
        const isDarkMode = this.#diagram.isDarkMode();
        const themeButton = this.#button("dark-mode");

        if (themeButton) {
            themeButton.innerHTML = isDarkMode ? darkModeIcon : lightModeIcon;
            // Named for diagrams throughout, so it is never mistaken for the
            // page theme toggle in the header.
            this.#paintToggleButton(
                "dark-mode",
                isDarkMode,
                isDarkMode
                    ? "Switch diagrams to light mode"
                    : "Switch diagrams to dark mode",
            );
        }

        this.#paintToggleButton(
            "toggle-description",
            this.#labels.descriptions,
            this.#labels.descriptions
                ? "Hide descriptions in diagrams"
                : "Show descriptions in diagrams",
        );
        this.#paintToggleButton(
            "toggle-technologies",
            this.#labels.technologies,
            this.#labels.technologies
                ? "Hide technologies in diagrams"
                : "Show technologies in diagrams",
        );
    }

    #addControlButtons(container: HTMLElement) {
        const hasAnimations =
            this.#diagram.currentViewHasAnimation() ||
            this.#diagram.currentViewIsDynamic();

        container.innerHTML = `
            <div class="actions ${styles.btnGroup}">
                <button class="zoom-out" title="Zoom out" aria-label="Zoom out">${zoomOutIcon}</button>
                <button class="zoom-in" title="Zoom in" aria-label="Zoom in">${zoomInIcon}</button>
                <button class="reset-zoom" title="Fit diagram" aria-label="Fit diagram">${resetZoomIcon}</button>
                <button class="dark-mode"></button>
                <button class="toggle-description">${toggleDescriptionsIcon}</button>
                <button class="toggle-technologies">${toggleTechnologiesIcon}</button>
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

        this.#paintControlButtons();
        this.#toggleBackButton();

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
        this.#unsubscribeTheme?.();
        this.#unsubscribeTheme = null;

        const container = this.element?.querySelector(
            `.${styles.controlButtons}`,
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
        // Attached first: the paint helpers look the buttons up through
        // `this.element`, so the container has to be in the tree already.
        this.element.appendChild(controlButtonsContainer);
        this.#addControlButtons(controlButtonsContainer);
    }
}
