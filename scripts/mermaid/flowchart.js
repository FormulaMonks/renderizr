/**
 * Turns Mermaid's parsed flowchart (`FlowDB`) into the plain model the page
 * draws (spec: Parsing in the build): nodes, edges, subgraphs, classes and
 * direction, every label as plain text lines. The page sizes, lays out and
 * styles it; nothing here guesses a size or writes a style.
 *
 * What it leaves out goes to `ignored`. A construct that would change what
 * the diagram means throws `NotDrawnYet`, which fails the whole diagram.
 */

import { checkCss, checkEdgeCss, NODE_CSS } from "./styling.js";
import { NotDrawnYet } from "./warnings.js";

/** An HTML tag other than a line break, which Mermaid reads anyway. */
const HTML_TAG = /<(?!br\s*\/?>)\/?[a-z][^>]*>/i;

/**
 * Mermaid's shape names, from the flowchart grammar and `@{ shape: … }`,
 * onto the shapes Renderizr draws (spec: Shapes).
 */
const SHAPES = {
    squareRect: "Box",
    rect: "Box",
    rectangle: "Box",
    proc: "Box",
    process: "Box",
    rounded: "RoundedBox",
    roundedRect: "RoundedBox",
    event: "RoundedBox",
    diamond: "Diamond",
    question: "Diamond",
    diam: "Diamond",
    decision: "Diamond",
    circle: "Circle",
    circ: "Circle",
    cylinder: "Cylinder",
    cyl: "Cylinder",
    database: "Cylinder",
    db: "Cylinder",
    hexagon: "Hexagon",
    hex: "Hexagon",
    prepare: "Hexagon",
};

/** What the ignored-styling warning calls a shape that falls back to a rectangle. */
const FALLBACK_NAMES = {
    odd: "asymmetric",
    lean_right: "parallelogram",
    lean_left: "parallelogram",
    trapezoid: "trapezoid",
    inv_trapezoid: "trapezoid",
    doublecircle: "double circle",
};

/** Mermaid's arrow ends onto End marker names (spec: End markers). */
const ENDS = {
    none: "none",
    arrow_open: "none",
    arrow_point: "arrow",
    arrow_circle: "circle",
    arrow_cross: "cross",
};

/** Mermaid's directions; `TD` is `TB`. */
const DIRECTIONS = { TB: "TB", TD: "TB", BT: "BT", LR: "LR", RL: "RL" };

/** Mermaid's `#name;` and `#NN;` entity codes, and the HTML ones a label may hold. */
const ENTITIES = {
    quot: '"',
    amp: "&",
    lt: "<",
    gt: ">",
    apos: "'",
    nbsp: " ",
};

const entity = (__, name) =>
    /^\d+$/.test(name)
        ? String.fromCodePoint(Number(name))
        : ENTITIES[name] ?? `#${name};`;

/** `text` with every tag gone, removed again until none is left. */
function withoutTags(text) {
    let previous;
    let current = text;
    do {
        previous = current;
        current = current.replace(/<[^>]*>/g, "");
    } while (current !== previous);
    return current;
}

/**
 * A label as plain text lines: `<br>` and the end of each block element
 * break the line, every other tag goes (Structurizr's `mermaid <viewKey>`
 * export writes HTML into its labels), entities decode, and the quotes and
 * Markdown backticks around a string go.
 */
export function plainLabel(label) {
    return withoutTags(
        String(label ?? "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(div|p|li|h\d)>/gi, "\n"),
    )
        .replace(/[#&](\w+);/g, entity)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
        .replace(/^"([\s\S]*)"$/, "$1");
}

/** A label, with what of it Renderizr leaves out added to `ignored`. */
function labelOf(item, ignored) {
    // Structurizr's `mermaid <viewKey>` export writes HTML into its labels,
    // which draw as plain text lines.
    if (HTML_TAG.test(String(item.label ?? item.title ?? "")))
        ignored.add("htmlLabels");
    let label = plainLabel(item.label ?? item.title);
    if (/(^|\s)fa[bklrs]?:fa-[\w-]+/.test(label)) {
        ignored.add("fa: icons");
        label = label
            .replace(/(^|\s)fa[bklrs]?:fa-[\w-]+/g, " ")
            .replace(/ {2,}/g, " ")
            .trim();
    }
    if (item.labelType === "markdown" && /\*|__?\w/.test(label)) {
        ignored.add("Markdown strings");
        label = label.replace(/\*\*|__|\*|(?<=\s|^)_|_(?=\s|$)/g, "");
    }
    return label;
}

/** A class list without Mermaid's own `default` and `clickable`. */
const classesOf = (value) =>
    String(value ?? "")
        .split(/\s+/)
        .filter((c) => c && c !== "default" && c !== "clickable");

/**
 * The page's model of the flowchart `db` parsed (spec: The view model).
 * Nodes and subgraphs keep Mermaid's ids; edges are numbered in source
 * order, as `linkStyle` counts them.
 */
export function readFlowchart(db, ignored) {
    const { nodes: items, edges: links } = db.getData();
    const groups = new Set(items.filter((n) => n.isGroup).map((n) => n.id));
    const directions = new Map(
        db.getSubGraphs().map((subgraph) => [subgraph.id, subgraph.dir]),
    );

    const subgraphs = [];
    const nodes = [];
    for (const item of items) {
        const parent = item.parentId && { parent: item.parentId };
        checkCss(item.cssStyles, NODE_CSS, ignored);
        if (item.isGroup) {
            const direction = DIRECTIONS[directions.get(item.id)];
            subgraphs.push({
                id: item.id,
                label: labelOf(item, ignored),
                ...parent,
                ...(direction && { direction }),
                classes: classesOf(item.cssClasses),
                styles: item.cssStyles ?? [],
            });
            continue;
        }
        // A callback runs the page's own script; only a link leads anywhere.
        if (db.vertices?.get(item.id)?.haveCallback)
            ignored.add("click callbacks");
        const shape = SHAPES[item.shape];
        if (!shape)
            ignored.add(`shape "${FALLBACK_NAMES[item.shape] ?? item.shape}"`);
        nodes.push({
            id: item.id,
            label: labelOf(item, ignored) || item.id,
            shape: shape ?? "Box",
            ...parent,
            classes: classesOf(item.cssClasses),
            styles: item.cssStyles ?? [],
            ...(item.link && { link: item.link }),
            ...(item.linkTarget && { linkTarget: item.linkTarget }),
            ...(item.tooltip && { tooltip: item.tooltip }),
        });
    }

    const edges = [];
    for (const [index, link] of links.entries()) {
        if (groups.has(link.start) || groups.has(link.end)) {
            throw new NotDrawnYet("an edge to a subgraph");
        }
        if (link.pattern === "invisible") {
            ignored.add("invisible links");
            continue;
        }
        if ((link.minlen ?? 1) > 1) ignored.add("link length");
        checkEdgeCss(link.style, ignored);
        edges.push({
            id: String(index),
            source: link.start,
            target: link.end,
            label: labelOf(link, ignored),
            line:
                link.pattern === "dotted" || link.pattern === "thick"
                    ? link.pattern
                    : "normal",
            start: ENDS[link.arrowTypeStart] ?? link.arrowTypeStart,
            end: ENDS[link.arrowTypeEnd] ?? link.arrowTypeEnd,
            styles: link.style ?? [],
        });
    }

    for (const definition of db.getClasses().values())
        checkCss(definition.styles, NODE_CSS, ignored);
    const classDefs = Object.fromEntries(
        [...db.getClasses()].map(([name, definition]) => [
            name,
            definition.styles ?? [],
        ]),
    );

    return {
        kind: "flowchart",
        direction: DIRECTIONS[db.getDirection()] ?? "TB",
        nodes,
        edges,
        subgraphs,
        classDefs,
    };
}
