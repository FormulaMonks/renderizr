/**
 * The "Keyboard shortcuts" dialog (spec 17.2): every key edit mode takes,
 * grouped into selection, moving, arranging, history and view. `?` or the
 * edit toolbar's keyboard button opens it, and Escape closes it. Only edit
 * mode opens it; builds compile it out (ADR 15).
 */

import own from "./shortcuts-dialog.module.css";
import { keyboardMap } from "./shortcuts";
import styles from "./unsaved-dialog.module.css";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Open "Keyboard shortcuts" in `container`, or leave the one already open.
 * It closes on Escape or its Close button and hands focus back to what had
 * it.
 */
export function openShortcuts(container: HTMLElement) {
    if (container.querySelector("[data-shortcuts-dialog]")) return;
    const opener = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("div");
    dialog.className = styles.backdrop;
    dialog.dataset.shortcutsDialog = "";
    dialog.innerHTML = `
        <div class="${styles.dialog} ${own.dialog}" role="dialog" aria-modal="true" aria-labelledby="shortcuts-dialog-title">
            <h2 id="shortcuts-dialog-title">Keyboard shortcuts</h2>
            <div class="${own.groups}">
                ${keyboardMap()
                    .map(
                        (group) => `
                    <section>
                        <h3>${group.name}</h3>
                        <dl>
                            ${group.shortcuts
                                .map(
                                    (shortcut) =>
                                        `<dt>${shortcut.keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join(" ")}</dt><dd>${escapeHtml(shortcut.does)}</dd>`,
                                )
                                .join("")}
                        </dl>
                    </section>`,
                    )
                    .join("")}
            </div>
            <div class="${styles.buttons}">
                <button type="button" class="close-shortcuts ${styles.primary}">Close</button>
            </div>
        </div>
    `;
    container.appendChild(dialog);

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
    const button = dialog.querySelector<HTMLButtonElement>(".close-shortcuts");
    button?.addEventListener("click", close);
    button?.focus();
}
