/**
 * Walking the syntax tree Vite's `parseAst` gives, for the build steps that
 * rewrite literals in a chunk: `scripts/escapes.js` and
 * `scripts/short-lines.js`.
 */

/** Keys that hold positions and bookkeeping rather than child nodes. */
const NOT_A_CHILD = new Set(["type", "start", "end", "loc", "range", "parent"]);

/**
 * Whether an expression may stand where this node stands.
 *
 * A string is not always a value: it is also how property names, module
 * specifiers and import attributes are written, and none of those can be
 * replaced by a call.
 */
export function isValuePosition(node, parent) {
    if (!parent) return true;

    switch (parent.type) {
        case "Property":
        case "PropertyDefinition":
        case "MethodDefinition":
            return !(parent.key === node && !parent.computed);
        case "ImportDeclaration":
        case "ExportNamedDeclaration":
        case "ExportAllDeclaration":
            return parent.source !== node;
        case "ImportAttribute":
        case "ImportSpecifier":
        case "ExportSpecifier":
            return false;
        // A directive prologue is text, not an expression: rewriting it would
        // turn "use strict" into a statement that does nothing.
        case "ExpressionStatement":
            return parent.directive === undefined;
        default:
            return true;
    }
}

/**
 * Visits every node with both its parent and its grandparent.
 *
 * The grandparent is not decoration: a `TemplateElement`'s parent is always
 * the `TemplateLiteral` holding it, so a guard that wants to know whether it
 * sits inside a `TaggedTemplateExpression` has to look one level further up.
 */
export function walk(node, parent, visit, grandparent = null) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
        for (const child of node) walk(child, parent, visit, grandparent);
        return;
    }

    if (typeof node.type !== "string") return;
    visit(node, parent, grandparent);

    for (const key of Object.keys(node)) {
        if (NOT_A_CHILD.has(key)) continue;
        walk(node[key], node, visit, parent);
    }
}
