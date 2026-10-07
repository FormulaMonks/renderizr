import { readSetting, writeSetting } from "../storage";
import {
    type AnimationState,
    type Engine,
    type Labels,
    NOT_ANIMATING,
} from "../engine/contract";
import type { ModelView, WorkspaceModel } from "../model";
import { getResolvedTheme, onThemeChange, type ResolvedTheme } from "./theme";
import styles from "./current-view.module.css";
import lightModeIcon from "bootstrap-icons/icons/moon-fill.svg?raw";
import darkModeIcon from "bootstrap-icons/icons/sun-fill.svg?raw";
import toggleDescriptionsIcon from "bootstrap-icons/icons/card-text.svg?raw";
import toggleTechnologiesIcon from "bootstrap-icons/icons/code-square.svg?raw";
import resetZoomIcon from "bootstrap-icons/icons/aspect-ratio.svg?raw";
import zoomInIcon from "bootstrap-icons/icons/zoom-in.svg?raw";
import zoomOutIcon from "bootstrap-icons/icons/zoom-out.svg?raw";
import playIcon from "bootstrap-icons/icons/play-fill.svg?raw";
import pauseIcon from "bootstrap-icons/icons/pause-fill.svg?raw";
import prevStepIcon from "bootstrap-icons/icons/skip-start-fill.svg?raw";
import nextStepIcon from "bootstrap-icons/icons/skip-end-fill.svg?raw";
import Component from "./_component";
import { type EditingRoute, editButtons } from "./edit-buttons";

/** The part of the engine the toolbar drives. */
export type ToolbarEngine = Pick<
    Engine,
    | "setColorScheme"
    | "setLabels"
    | "fit"
    | "zoomIn"
    | "zoomOut"
    | "play"
    | "pause"
    | "stepForward"
    | "stepBack"
    | "onAnimationChanged"
>;

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

/** What a reader who never toggled a label sees: descriptions and technologies. */
export const LABEL_DEFAULTS: Labels = {
    descriptions: true,
    technologies: true,
};

export function readLabelState(): Labels {
    const raw = readSetting(DIAGRAM_LABELS_STORAGE_KEY);
    if (!raw) return { ...LABEL_DEFAULTS };

    try {
        const parsed = JSON.parse(raw) as Partial<Labels>;
        return {
            descriptions:
                typeof parsed.descriptions === "boolean"
                    ? parsed.descriptions
                    : LABEL_DEFAULTS.descriptions,
            technologies:
                typeof parsed.technologies === "boolean"
                    ? parsed.technologies
                    : LABEL_DEFAULTS.technologies,
        };
    } catch {
        return { ...LABEL_DEFAULTS };
    }
}

function writeLabelState(state: Labels): void {
    writeSetting(DIAGRAM_LABELS_STORAGE_KEY, JSON.stringify(state));
}

export default class CurrentView extends Component {
    #engine: ToolbarEngine;
    #model: WorkspaceModel;
    /** The page's editing route, in edit mode only (spec 4.6). */
    #editingRoute: EditingRoute | null;

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

    /** The color scheme the engine was last given. */
    #scheme: DiagramTheme = getDiagramTheme();

    #unsubscribeTheme: (() => void) | null = null;

    #actions = new Map<string, () => void>([
        ["zoom-in", () => this.#engine.zoomIn()],
        ["zoom-out", () => this.#engine.zoomOut()],
        ["reset-zoom", () => this.#engine.fit()],
        [
            "dark-mode",
            () =>
                this.applyColorScheme(
                    this.#scheme === "dark" ? "light" : "dark",
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
                    ? this.#engine.pause()
                    : this.#engine.play(),
        ],
        ["prev-step", () => this.#engine.stepBack()],
        ["next-step", () => this.#engine.stepForward()],
    ]);

    constructor(
        element: HTMLElement,
        engine: ToolbarEngine,
        model: WorkspaceModel,
        editingRoute: EditingRoute | null = null,
    ) {
        super(element);
        this.#engine = engine;
        this.#model = model;
        this.#editingRoute = editingRoute;

        // Seed the engine from the persisted preferences. Both setters are
        // idempotent, so this costs nothing when the engine was mounted with
        // the same state.
        this.applyColorScheme(this.#scheme);
        this.#engine.setLabels({ ...this.#labels });
    }

    /**
     * Listen to the engine and the page theme. Called by every `render()`,
     * after the `clear()` that stops listening, so a toolbar rendered again
     * after a clear still hears both.
     */
    #subscribe() {
        // The animation buttons render from the engine's state alone, so
        // nothing the toolbar does has to stop an animation behind its back.
        this.#unsubscribeAnimation = this.#engine.onAnimationChanged(
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
        play.innerHTML = playing ? pauseIcon : playIcon;
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

        this.#scheme = theme;
        this.#engine.setColorScheme(theme);
        this.#paintControlButtons();
    }

    #setLabels(next: Partial<Labels>) {
        this.#labels = { ...this.#labels, ...next };
        writeLabelState(this.#labels);

        this.#engine.setLabels({ ...this.#labels });
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
        const isDarkMode = this.#scheme === "dark";
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

    #addControlButtons(container: HTMLElement, view: ModelView) {
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

        // Builds compile edit mode out, so no pencil reaches them (ADR 15).
        if (__RENDERIZR_EDIT_MODE__ && this.#editingRoute) {
            const group = editButtons(view, this.#model, this.#editingRoute);
            if (group) container.appendChild(group);
        }

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
        this.#addControlButtons(controlButtonsContainer, view);
    }
}
