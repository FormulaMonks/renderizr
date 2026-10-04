import { readSetting, writeSetting } from "../storage";
import {
    type AnimationControls,
    type AnimationState,
    type Labels,
    NOT_ANIMATING,
} from "../engine/contract";
import type { Diagram } from "../types/structurizr-diagram";
import type { WorkspaceModel } from "../model";
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
import prevStepIcon from "../../vendor/structurizr/bootstrap-icons/skip-start-fill.svg?raw";
import nextStepIcon from "../../vendor/structurizr/bootstrap-icons/skip-end-fill.svg?raw";
import Component from "./_component";

/**
 * Bootstrap Icons' `pause-fill` (MIT, like the vendored icons beside it).
 * Upstream Structurizr ships no pause icon for `pnpm sync:vendor` to copy;
 * the toolbar takes every icon from the `bootstrap-icons` package at cutover
 * (spec 16).
 */
const PAUSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pause-fill" viewBox="0 0 16 16"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5m5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5"/></svg>`;

/** The part of the Structurizr `Diagram` the toolbar drives. */
export type ToolbarDiagram = Pick<
    Diagram,
    | "getCurrentView"
    | "isDarkMode"
    | "setDarkMode"
    | "toggleDescription"
    | "toggleMetadata"
>;

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

    // Migrate readers coming from the previous Structurizr-flavored key.
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

/**
 * `structurizr-diagram.js` initializes `descriptionEnabled` and
 * `metadataEnabled` to `true`, so a freshly constructed diagram shows both.
 */
export const STRUCTURIZR_LABEL_DEFAULTS: Labels = {
    descriptions: true,
    technologies: true,
};

export function readLabelState(): Labels {
    const raw = readSetting(DIAGRAM_LABELS_STORAGE_KEY);
    if (!raw) return { ...STRUCTURIZR_LABEL_DEFAULTS };

    try {
        const parsed = JSON.parse(raw) as Partial<Labels>;
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

function writeLabelState(state: Labels): void {
    writeSetting(DIAGRAM_LABELS_STORAGE_KEY, JSON.stringify(state));
}

export default class CurrentView extends Component {
    #diagram: ToolbarDiagram;
    #controls: DiagramControls;
    #animation: AnimationControls;
    #model: WorkspaceModel;

    /**
     * The engine's animation state, which the animation buttons render from;
     * not animating until the engine says otherwise.
     */
    #animationState: AnimationState = NOT_ANIMATING;
    #unsubscribeAnimation: (() => void) | null = null;

    /**
     * What the reader wants to see. Lives on the component — which survives
     * the view changes that rebuild the toolbar — *and* in localStorage, which
     * survives a reload.
     */
    #labels: Labels = readLabelState();

    /**
     * What the diagram is actually showing. `structurizr-diagram.js` exposes
     * no getter or setter for these flags — only `toggleDescription()` and
     * `toggleMetadata()` — and `changeView()` leaves them alone, so we mirror
     * them here and toggle only on a mismatch. That turns the toggles into
     * idempotent setters and stops the state from ever drifting or
     * double-flipping.
     */
    #appliedLabels: Labels = { ...STRUCTURIZR_LABEL_DEFAULTS };

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
        // Play toggles pause, keeping the step (spec 11).
        [
            "play-animation",
            () =>
                this.#animationState.playing
                    ? this.#animation.pause()
                    : this.#animation.play(),
        ],
        ["prev-step", () => this.#animation.stepBack()],
        ["next-step", () => this.#animation.stepForward()],
    ]);

    constructor(
        element: HTMLElement,
        diagram: ToolbarDiagram,
        controls: DiagramControls,
        animation: AnimationControls,
        model: WorkspaceModel,
    ) {
        super(element);
        this.#diagram = diagram;
        this.#controls = controls;
        this.#animation = animation;
        this.#model = model;

        // Seed the engine from the persisted preferences before anything is
        // drawn. Both are safe this early: `setDarkMode()` bails out of
        // `renderView()` while there is no current view, and the label flags
        // are re-read every time a view is drawn.
        this.applyColorScheme(getDiagramTheme());
        this.#syncLabels();
    }

    /**
     * Listen to the engine and the page theme. Called by every `render()`,
     * after the `clear()` that stops listening, so a toolbar rendered again
     * after a clear still hears both.
     */
    #subscribe() {
        // The animation buttons render from the engine's state alone, so
        // nothing the toolbar does has to stop an animation behind its back.
        this.#unsubscribeAnimation = this.#animation.onAnimationChanged(
            (state) => {
                this.#animationState = state;
                this.#paintAnimationButtons();
            },
        );

        // Until the reader makes a diagram-specific choice, diagrams follow
        // the page (and, through it, the OS). After that they never do again.
        // A change made while the toolbar was cleared is caught up here.
        const follow = (resolved: ResolvedTheme) => {
            if (getStoredDiagramTheme()) return;
            this.applyColorScheme(resolved);
        };
        follow(getResolvedTheme());
        this.#unsubscribeTheme = onThemeChange(follow);
    }

    #button(name: string): HTMLButtonElement | null {
        return (
            this.element?.querySelector<HTMLButtonElement>(`.${name}`) ?? null
        );
    }

    /**
     * Paints the animation buttons from the engine's state (spec 11): hidden
     * when the view has no steps, prev and next enabled whenever it has, and
     * play showing pause while it plays.
     */
    #paintAnimationButtons() {
        const { steps, playing } = this.#animationState;
        const group =
            this.element?.querySelector<HTMLElement>(".animation-buttons");
        if (!group) return;
        group.hidden = steps === 0;

        for (const name of ["prev-step", "next-step"]) {
            const button = this.#button(name);
            if (button) button.disabled = steps === 0;
        }

        const play = this.#button("play-animation");
        if (!play) return;
        const label = playing ? "Pause animation" : "Play animation";
        play.innerHTML = playing ? PAUSE_ICON : playIcon;
        play.dataset.playing = playing ? "true" : "";
        play.title = label;
        play.setAttribute("aria-label", label);
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
            this.#diagram.setDarkMode(darkMode);
        }

        this.#paintControlButtons();
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

    #setLabels(next: Partial<Labels>) {
        this.#labels = { ...this.#labels, ...next };
        writeLabelState(this.#labels);

        this.#syncLabels();
        this.#paintControlButtons();
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
        container.innerHTML = `
            <div class="actions ${styles.btnGroup}">
                <button class="zoom-out" title="Zoom out" aria-label="Zoom out">${zoomOutIcon}</button>
                <button class="zoom-in" title="Zoom in" aria-label="Zoom in">${zoomInIcon}</button>
                <button class="reset-zoom" title="Fit diagram" aria-label="Fit diagram">${resetZoomIcon}</button>
                <button class="dark-mode"></button>
                <button class="toggle-description">${toggleDescriptionsIcon}</button>
                <button class="toggle-technologies">${toggleTechnologiesIcon}</button>
            </div>
            <div class="animation-buttons ${styles.btnGroup}" hidden>
                <button class="prev-step" title="Previous step" aria-label="Previous step">${prevStepIcon}</button>
                <button class="play-animation"></button>
                <button class="next-step" title="Next step" aria-label="Next step">${nextStepIcon}</button>
            </div>
        `;

        this.#paintControlButtons();
        this.#paintAnimationButtons();

        for (const [id, action] of this.#actions) {
            const button = container.querySelector(`.${id}`);
            button?.addEventListener("click", action);
        }
    }

    clear() {
        this.#unsubscribeTheme?.();
        this.#unsubscribeTheme = null;
        this.#unsubscribeAnimation?.();
        this.#unsubscribeAnimation = null;

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
        currentView: { key: string } | null = null,
        _element?: Record<string, unknown>,
    ) {
        if (!this.element || !currentView) return;
        const view = this.#model.findViewByKey(currentView.key);
        if (!view) return;
        this.clear();
        this.#subscribe();
        const [description, author] = view.description.split("Author: ");
        // Structurizr's own naming: an explicit title when the view has one,
        // otherwise "Container View: Internet Banking System" and the like.
        const title = this.#model.getTitleForView(view);
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
