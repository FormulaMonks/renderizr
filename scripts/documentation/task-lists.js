import { CLASSES } from "./classes.js";

/**
 * GitHub's task lists: a list item that starts with `[ ]`, `[x]` or `[X]`
 * and a space shows a read-only checkbox in place of its bullet, and
 * AsciiDoc's checklist (`* [ ]`, `* [x]`, `* [*]`) renders the same markup.
 * The list takes `rz-task-list` and each task item `rz-task-list-item`, so
 * an ordinary item in the same list keeps its bullet.
 */

const TASK = /^\[([ xX])\][ \t]+(?=\S)/;
const MARKER = /^\[[ xX]\][ \t]+/;

/** The checkbox a task item starts with. */
const checkbox = (checked) =>
    `<input class="${CLASSES.taskListCheckbox}" type="checkbox" disabled${checked ? " checked" : ""}>`;

/**
 * Add `name` to the classes of `token`.
 *
 * @param {import("markdown-it/lib/token.mjs").default} token
 * @param {string} name
 */
const addClass = (token, name) => {
    const classes = token.attrGet("class");
    token.attrSet("class", classes ? `${classes} ${name}` : name);
};

/**
 * Turn each list item that starts with a task marker into a task item. It
 * reads the item's first inline token, so a marker in code (`` `[ ]` ``) or
 * after other text stays as written.
 */
function taskItems(state) {
    const tokens = state.tokens;

    tokens.forEach((token, index) => {
        if (token.type !== "list_item_open") return;
        const paragraph = tokens[index + 1];
        const inline = tokens[index + 2];
        if (paragraph?.type !== "paragraph_open" || inline?.type !== "inline")
            return;

        // The marker as written decides, since the text that follows it may
        // be a link of its own (`- [ ] https://…`).
        const marker = TASK.exec(inline.content);
        const first = inline.children?.[0];
        const lead = first?.type === "text" && MARKER.exec(first.content);
        if (!marker || !lead) return;

        first.content = first.content.slice(lead[0].length);
        const box = new state.Token("html_inline", "", 0);
        box.content = `${checkbox(marker[1] !== " ")} `;
        inline.children.unshift(box);
        addClass(token, CLASSES.taskListItem);

        // The list this item belongs to: the nearest list opening before it
        // at one level up.
        for (let at = index - 1; at >= 0; at--) {
            const list = tokens[at];
            if (
                list.level === token.level - 1 &&
                (list.type === "bullet_list_open" ||
                    list.type === "ordered_list_open")
            ) {
                if (!list.attrGet("class")?.includes(CLASSES.taskList))
                    addClass(list, CLASSES.taskList);
                break;
            }
        }
    });
}

/**
 * The markdown-it plugin for task lists. Its rule runs after the inline
 * rules, so the checkbox it adds never reaches the sanitizer.
 *
 * @param {import("markdown-it").default} md
 */
export function taskLists(md) {
    md.core.ruler.push("task_lists", taskItems);
}

/**
 * The asciidoctor.js plugin for task lists: a checklist renders the markup
 * the Markdown plugin writes.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciiDocTaskLists(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_ulist(node) {
                    if (!node.hasOption("checklist"))
                        return super.convert_ulist(node);

                    const items = [];
                    for (const item of node.getItems()) {
                        const task = item.hasAttribute("checkbox");
                        const classes = [
                            task ? CLASSES.taskListItem : null,
                            item.role,
                        ].filter(Boolean);
                        const box = task
                            ? `${checkbox(item.hasAttribute("checked"))} `
                            : "";
                        const blocks = item.hasBlocks()
                            ? `\n${await item.content()}\n`
                            : "";
                        items.push(
                            `<li${item.id != null ? ` id="${item.id}"` : ""}${classes.length ? ` class="${classes.join(" ")}"` : ""}>${box}${item.getText()}${blocks}</li>`,
                        );
                    }
                    const title = node.hasTitle()
                        ? `<div class="title">${node.title}</div>\n`
                        : "";
                    const classes = [CLASSES.taskList, node.role]
                        .filter(Boolean)
                        .join(" ");
                    return `${title}<ul${node.id != null ? ` id="${node.id}"` : ""} class="${classes}">\n${items.join("\n")}\n</ul>`;
                }
            },
    );
}
