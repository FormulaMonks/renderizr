/**
 * The dialog that guards a view switch in editing: when the author changed
 * the layout since entering editing, it says those changes will be lost and
 * offers "Discard and continue" and "Stay". Only edit mode opens it; builds
 * compile it out (ADR 15).
 */

import styles from "./unsaved-dialog.module.css";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Ask whether to discard the layout changes made since entering editing,
 * shown on the view titled `title`, and go on. Resolves with `true` for
 * "Discard and continue" and `false` for "Stay", which Escape also picks. The dialog sits in `container` until answered and
 * hands focus back to what had it.
 */
export function confirmLeave(
    container: HTMLElement,
    title: string,
): Promise<boolean> {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("div");
    dialog.className = styles.backdrop;
    dialog.dataset.unsavedDialog = "";
    dialog.innerHTML = `
        <div class="${styles.dialog}" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
            <p id="unsaved-dialog-title">Leave ${escapeHtml(title)}? The layout changes you made since you started editing will be lost.</p>
            <div class="${styles.buttons}">
                <button type="button" class="stay ${styles.secondary}">Stay</button>
                <button type="button" class="discard-and-continue ${styles.primary}">Discard and continue</button>
            </div>
        </div>
    `;
    container.appendChild(dialog);

    return new Promise((resolve) => {
        const close = (discard: boolean) => {
            document.removeEventListener("keydown", onKey, true);
            dialog.remove();
            opener?.focus?.();
            resolve(discard);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            close(false);
        };
        document.addEventListener("keydown", onKey, true);
        dialog
            .querySelector(".stay")
            ?.addEventListener("click", () => close(false));
        dialog
            .querySelector(".discard-and-continue")
            ?.addEventListener("click", () => close(true));
        // Staying loses nothing, so it takes the focus.
        dialog.querySelector<HTMLButtonElement>(".stay")?.focus();
    });
}
