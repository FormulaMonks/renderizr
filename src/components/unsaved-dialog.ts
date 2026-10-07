/**
 * The dialog that guards unsaved changes (spec 7.5): before a view switch or
 * Done while the view's changes wait or a save has failed, it offers
 * "Save and continue" and "Stay". Only edit mode opens it; builds compile it
 * out (ADR 15).
 */

import styles from "./unsaved-dialog.module.css";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Ask whether to save the changes to the view titled `title` before going
 * on. Resolves with `true` for "Save and continue" and `false` for "Stay",
 * which Escape also picks. The dialog sits in `container` until answered and
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
            <p id="unsaved-dialog-title">The changes to ${escapeHtml(title)} aren't saved yet.</p>
            <div class="${styles.buttons}">
                <button type="button" class="stay ${styles.secondary}">Stay</button>
                <button type="button" class="save-and-continue ${styles.primary}">Save and continue</button>
            </div>
        </div>
    `;
    container.appendChild(dialog);

    return new Promise((resolve) => {
        const close = (save: boolean) => {
            document.removeEventListener("keydown", onKey, true);
            dialog.remove();
            opener?.focus?.();
            resolve(save);
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
        const save =
            dialog.querySelector<HTMLButtonElement>(".save-and-continue");
        save?.addEventListener("click", () => close(true));
        save?.focus();
    });
}
