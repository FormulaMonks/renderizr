/**
 * The "Calculate layout" dialog (spec 15): Structurizr Local's five options
 * for laying out the whole view once, kept in the browser's local storage
 * across views, and "Bring elements back onto the diagram". The run button
 * is the confirmation; undo is the safety net. Only edit mode opens it;
 * builds compile it out (ADR 15).
 */

import type { CalculateLayoutOptions } from "../engine/contract";
import own from "./calculate-layout-dialog.module.css";
import styles from "./unsaved-dialog.module.css";

/** Where local storage keeps the last options, shared by every view. */
export const OPTIONS_KEY = "renderizr.calculateLayout";

/** Structurizr's defaults (spec 15). */
export const DEFAULT_OPTIONS: Readonly<CalculateLayoutOptions> = {
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
    vertices: true,
};

const RANK_DIRECTIONS: [CalculateLayoutOptions["rankDirection"], string][] = [
    ["TopBottom", "Top to bottom"],
    ["BottomTop", "Bottom to top"],
    ["LeftRight", "Left to right"],
    ["RightLeft", "Right to left"],
];

const SEPARATIONS = [
    ["rankSeparation", "Rank separation"],
    ["nodeSeparation", "Node separation"],
    ["edgeSeparation", "Edge separation"],
] as const;

const isSeparation = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * The options local storage keeps, each one it lacks or holds wrong taken
 * from the defaults. Storage that throws, as in a private window, gives the
 * defaults.
 */
export function readOptions(
    storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): CalculateLayoutOptions {
    let stored: Partial<Record<keyof CalculateLayoutOptions, unknown>> = {};
    try {
        const parsed = JSON.parse(storage?.getItem(OPTIONS_KEY) ?? "{}");
        if (parsed && typeof parsed === "object") stored = parsed;
    } catch {
        stored = {};
    }
    const options = { ...DEFAULT_OPTIONS };
    if (RANK_DIRECTIONS.some(([value]) => value === stored.rankDirection))
        options.rankDirection =
            stored.rankDirection as CalculateLayoutOptions["rankDirection"];
    for (const [key] of SEPARATIONS) {
        const value = stored[key];
        if (isSeparation(value)) options[key] = value;
    }
    if (typeof stored.vertices === "boolean")
        options.vertices = stored.vertices;
    return options;
}

/** Keep `options` for the next run, on any view. */
export function writeOptions(
    options: CalculateLayoutOptions,
    storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
) {
    try {
        storage?.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
        // Storage that refuses only costs the next run its options.
    }
}

/** What the dialog's two actions do. */
export type CalculateLayoutActions = {
    calculate(options: CalculateLayoutOptions): void;
    bringBack(): void;
};

/**
 * Open the dialog in `container`. "Calculate layout" keeps the options and
 * runs them; "Bring elements back onto the diagram" runs at once; either
 * closes the dialog, as do Cancel and Escape. Focus goes back to what had it.
 */
export function openCalculateLayout(
    container: HTMLElement,
    actions: CalculateLayoutActions,
) {
    const opener = document.activeElement as HTMLElement | null;
    const options = readOptions();
    const dialog = document.createElement("div");
    dialog.className = styles.backdrop;
    dialog.dataset.calculateLayoutDialog = "";
    dialog.innerHTML = `
        <form class="${styles.dialog}" role="dialog" aria-modal="true" aria-labelledby="calculate-layout-title">
            <p id="calculate-layout-title"><strong>Calculate layout</strong></p>
            <label class="${own.field}">Rank direction
                <select name="rankDirection">
                    ${RANK_DIRECTIONS.map(
                        ([value, label]) =>
                            `<option value="${value}"${value === options.rankDirection ? " selected" : ""}>${label}</option>`,
                    ).join("")}
                </select>
            </label>
            ${SEPARATIONS.map(
                ([key, label]) =>
                    `<label class="${own.field}">${label}
                        <input name="${key}" type="number" min="0" step="1" value="${options[key]}">
                    </label>`,
            ).join("")}
            <label class="${own.field} ${own.check}">
                <input name="vertices" type="checkbox"${options.vertices ? " checked" : ""}> Vertices
            </label>
            <div class="${styles.buttons} ${own.bringBack} ${own.actions}">
                <button type="button" class="bring-back ${styles.secondary}">Bring elements back onto the diagram</button>
            </div>
            <div class="${styles.buttons} ${own.actions}">
                <button type="button" class="cancel ${styles.secondary}">Cancel</button>
                <button type="submit" class="calculate ${styles.primary}">Calculate layout</button>
            </div>
        </form>
    `;
    container.appendChild(dialog);
    const form = dialog.querySelector("form") as HTMLFormElement;

    const close = () => {
        document.removeEventListener("keydown", onKey, true);
        dialog.remove();
        opener?.focus?.();
    };
    const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close();
    };
    document.addEventListener("keydown", onKey, true);

    const chosen = (): CalculateLayoutOptions => {
        const value = (name: string) =>
            (form.elements.namedItem(name) as HTMLInputElement).value;
        const number = (
            name: keyof CalculateLayoutOptions,
            fallback: number,
        ) => {
            const parsed = Number(value(name));
            return isSeparation(parsed) ? Math.round(parsed) : fallback;
        };
        return {
            rankDirection: value(
                "rankDirection",
            ) as CalculateLayoutOptions["rankDirection"],
            rankSeparation: number("rankSeparation", options.rankSeparation),
            nodeSeparation: number("nodeSeparation", options.nodeSeparation),
            edgeSeparation: number("edgeSeparation", options.edgeSeparation),
            vertices: (form.elements.namedItem("vertices") as HTMLInputElement)
                .checked,
        };
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const picked = chosen();
        writeOptions(picked);
        close();
        actions.calculate(picked);
    });
    dialog.querySelector(".bring-back")?.addEventListener("click", () => {
        close();
        actions.bringBack();
    });
    dialog.querySelector(".cancel")?.addEventListener("click", close);
    dialog.querySelector<HTMLButtonElement>(".calculate")?.focus();
}
