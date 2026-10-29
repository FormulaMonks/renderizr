/**
 * The toast (spec 264, _The toast_): one region at the bottom right of the
 * page, over the canvas, where every system message goes, in built sites, in
 * `pnpm dev` and in edit mode.
 *
 * A message is one of two kinds. A notice says what the page did for the
 * reader and leaves after `NOTICE_MS`, unless the pointer rests on it or
 * focus is inside it. An error says what went wrong and stays until the
 * caller takes it away, the author picks one of its actions or someone
 * closes it. Each kind has one slot: a new message of a kind replaces the
 * last one of that kind.
 *
 * The region has no element of its own to own until the first message, so
 * this is a module of functions with module state, as `theme.ts` is.
 */

import closeIcon from "bootstrap-icons/icons/x-lg.svg?raw";
import styles from "./toast.module.css";

/** What a toast says: what the page did, or what went wrong. */
export type ToastKind = "notice" | "error";

/** A button on an error toast, which takes the toast away and then runs. */
export type ToastAction = { label: string; run: () => void };

/** What an error toast shows beyond its text. */
export type ErrorOptions = {
    /** Preformatted text under the message, such as a tool's output. */
    detail?: string;
    /**
     * Buttons in order, the first as primary. An error with actions waits
     * for one and offers no Dismiss.
     */
    actions?: readonly ToastAction[];
};

/** How long a notice shows while nothing holds it, in milliseconds. */
export const NOTICE_MS = 6000;

/** The toast of each kind on the page, with what takes it away. */
const shown = new Map<ToastKind, { toast: HTMLElement; remove: () => void }>();

/** The region every toast goes in, made the first time one shows. */
function region(): HTMLElement {
    const found = document.querySelector<HTMLElement>("[data-toasts]");
    if (found) return found;
    const created = document.createElement("div");
    created.className = styles.region;
    created.setAttribute("data-toasts", "");
    created.setAttribute("role", "region");
    created.setAttribute("aria-label", "Messages");
    document.body.appendChild(created);
    return created;
}

/**
 * Put up a toast of `kind` saying `text`, in place of the last one of that
 * kind. Returns what takes this toast away, and leaves alone any toast that
 * replaced it.
 */
function show(
    kind: ToastKind,
    text: string,
    { detail, actions = [] }: ErrorOptions = {},
): () => void {
    dismissToast(kind);
    const toast = document.createElement("div");
    toast.className = styles.toast;
    toast.setAttribute("data-toast", kind);
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.innerHTML = `<p></p>${
        actions.length
            ? ""
            : `<button type="button" class="${styles.close}" aria-label="Dismiss" title="Dismiss">${closeIcon}</button>`
    }`;
    toast.querySelector("p")!.textContent = text;

    let timer: number | undefined;
    const remove = () => {
        window.clearTimeout(timer);
        toast.remove();
        if (shown.get(kind)?.toast === toast) shown.delete(kind);
    };
    toast.querySelector("button")?.addEventListener("click", () => remove());

    if (detail) {
        const pre = document.createElement("pre");
        pre.textContent = detail;
        toast.appendChild(pre);
    }

    if (actions.length) {
        const row = document.createElement("div");
        row.className = styles.actions;
        for (const [index, action] of actions.entries()) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = index === 0 ? styles.primary : styles.secondary;
            button.setAttribute("data-toast-action", "");
            button.textContent = action.label;
            button.addEventListener("click", () => {
                remove();
                action.run();
            });
            row.appendChild(button);
        }
        toast.appendChild(row);
    }

    if (kind === "notice")
        holdWhileInUse(toast, (wait) => {
            window.clearTimeout(timer);
            timer = wait === null ? undefined : window.setTimeout(remove, wait);
        });

    region().appendChild(toast);
    shown.set(kind, { toast, remove });
    return remove;
}

/**
 * Give the notice `toast` `NOTICE_MS` through `schedule`, which sets when it
 * leaves (null: not while held). The pointer resting on it or focus inside
 * it holds it, and it gets the rest of its time once neither does. The bar
 * that drains along its foot pauses with it, through `data-paused`.
 */
function holdWhileInUse(
    toast: HTMLElement,
    schedule: (wait: number | null) => void,
) {
    const bar = document.createElement("div");
    bar.className = styles.timer;
    bar.setAttribute("data-toast-timer", "");
    bar.innerHTML = "<i></i>";
    bar.style.setProperty("--toast-lasts", `${NOTICE_MS}ms`);
    toast.appendChild(bar);

    let hovered = false;
    let focused = false;
    let left = NOTICE_MS;
    let since = Date.now();
    const follow = () => {
        const held = hovered || focused;
        if (held === toast.hasAttribute("data-paused")) return;
        if (held) {
            left = Math.max(0, left - (Date.now() - since));
            toast.setAttribute("data-paused", "");
            schedule(null);
        } else {
            since = Date.now();
            toast.removeAttribute("data-paused");
            schedule(left);
        }
    };
    schedule(NOTICE_MS);

    toast.addEventListener("pointerenter", () => {
        hovered = true;
        follow();
    });
    toast.addEventListener("pointerleave", () => {
        hovered = false;
        follow();
    });
    toast.addEventListener("focusin", () => {
        focused = true;
        follow();
    });
    toast.addEventListener("focusout", (event) => {
        // Focus moving between the notice's own buttons still holds it.
        const next = (event as FocusEvent).relatedTarget;
        if (next instanceof Node && toast.contains(next)) return;
        focused = false;
        follow();
    });
}

/** Say `text`, what the page did for the reader, for `NOTICE_MS`. */
export function showNotice(text: string): () => void {
    return show("notice", text);
}

/**
 * Say `text`, what went wrong, until the caller takes it away, the author
 * picks one of `actions` or someone closes it.
 */
export function showError(text: string, options?: ErrorOptions): () => void {
    return show("error", text, options);
}

/** Take away the toast of `kind`, if one shows. */
export function dismissToast(kind: ToastKind) {
    shown.get(kind)?.remove();
}

/**
 * Show `text`, what went wrong, and `detail` in place of the contents of
 * `target`, the canvas, while the page has nothing to draw yet. It looks as
 * an error toast does and stays until the page reloads.
 */
export function showErrorInPlace(
    target: HTMLElement,
    text: string,
    detail: string,
) {
    target.innerHTML = `
        <div class="${styles.toast} ${styles.inPlace}" data-error-in-place role="alert">
            <p></p>
            <pre></pre>
        </div>
    `;
    target.querySelector("p")!.textContent = text;
    target.querySelector("pre")!.textContent = detail;
}
