/**
 * What the diagrams page says when `workspace.json` changes on disk in edit
 * mode (spec 6.2, 6.3): the bar over edits that couldn't be saved, with
 * **Keep my changes** and **Discard them**, and a notice when the view
 * shown is gone or can no longer be edited. Each sits above the canvas,
 * before `canvas`. Only edit mode shows them; builds compile them out
 * (ADR 15).
 */

import styles from "./reload-bar.module.css";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Put `element` above `canvas`, in place of any line of its kind there. */
function place(canvas: HTMLElement, element: HTMLElement, kind: string) {
    canvas.parentElement?.querySelector(`[${kind}]`)?.remove();
    element.setAttribute(kind, "");
    canvas.before(element);
}

/**
 * Show the bar over the held edits of the view titled `title`. Each button
 * takes the bar away before it runs its action. Returns a way to take it
 * away.
 */
export function showHeldBar(
    canvas: HTMLElement,
    title: string,
    actions: { keep(): void; discard(): void },
): () => void {
    const bar = document.createElement("div");
    bar.className = styles.bar;
    bar.setAttribute("role", "alert");
    bar.innerHTML = `
        <p>workspace.json changed on disk while ${escapeHtml(title)} had unsaved changes</p>
        <button type="button" class="keep-changes ${styles.primary}">Keep my changes</button>
        <button type="button" class="discard-changes ${styles.secondary}">Discard them</button>
    `;
    const remove = () => bar.remove();
    bar.querySelector(".keep-changes")?.addEventListener("click", () => {
        remove();
        actions.keep();
    });
    bar.querySelector(".discard-changes")?.addEventListener("click", () => {
        remove();
        actions.discard();
    });
    place(canvas, bar, "data-held-bar");
    return remove;
}

/** Say `text` above the canvas until the author dismisses it. */
export function showReloadNotice(canvas: HTMLElement, text: string) {
    const notice = document.createElement("div");
    notice.className = styles.bar;
    notice.setAttribute("role", "status");
    notice.innerHTML = `
        <p>${escapeHtml(text)}</p>
        <button type="button" class="dismiss-notice ${styles.secondary}">Dismiss</button>
    `;
    notice
        .querySelector(".dismiss-notice")
        ?.addEventListener("click", () => notice.remove());
    place(canvas, notice, "data-reload-notice");
}
