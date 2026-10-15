// PROTOTYPE (issue 179). Turns each image view that carries Mermaid flowchart source into an ordinary custom view:
// custom elements, relationships, groups and automatic layout. The source's shapes, classDef, style, linkStyle, theme
// variables and curve become implied tags with style definitions, so the existing style cascade applies them.
import { inflateSync } from "node:zlib";
import { read } from "./parser.js";

const FIELDS = ["content", "contentLight", "contentDark"];
const TEMPLATE_START = '{ "code":"';
const TEMPLATE_END = '", "mermaid":{"theme":"default"}}';

/** The Mermaid source a content URL carries, or undefined when it holds none. */
export function decodeMermaid(value, mermaidUrl) {
    if (typeof value !== "string" || !mermaidUrl) return undefined;
    const base = mermaidUrl.replace(/\/+$/, "");
    const match = [`${base}/svg/`, `${base}/img/`].find((p) =>
        value.startsWith(p),
    );
    if (!match) return undefined;
    const encoded = value.slice(match.length).split("?")[0];
    if (!encoded.startsWith("pako:")) {
        return Buffer.from(encoded, "base64url").toString("utf8");
    }
    const json = inflateSync(
        Buffer.from(encoded.slice(5), "base64url"),
    ).toString("utf8");
    const code = json.slice(TEMPLATE_START.length, -TEMPLATE_END.length);
    return code.replace(/\\(n|")/g, (_, c) => (c === "n" ? "\n" : '"'));
}

// Mermaid shape names (FlowDB.getData) onto Renderizr shapes; anything else falls back to a box.
const SHAPES = {
    squareRect: "Box",
    rect: "Box",
    rounded: "RoundedBox",
    roundedRect: "RoundedBox",
    stadium: "RoundedBox",
    subroutine: "Box",
    cylinder: "Cylinder",
    cyl: "Cylinder",
    circle: "Circle",
    doublecircle: "Circle",
    diamond: "Diamond",
    question: "Diamond",
    hexagon: "Hexagon",
};

// Mermaid sizes text at 16 px; Renderizr draws Mermaid diagrams at 24 px, so every Mermaid length scales by 1.5.
const SCALE = 1.5;
const TEXT = 16 * SCALE;
// The element font size whose name (drawn at 1.4 times) comes out at TEXT.
const FONT_SIZE = Math.round(TEXT / 1.4);

/**
 * A node's box the way Mermaid sizes it: the label plus 30 on each side and 15 above and below, at 16 px, scaled. The
 * build has no text measurement, so it estimates the label from an average glyph width.
 */
function sizeFor(label, shape) {
    const lines = label.split("\n");
    const longest = Math.max(...lines.map((line) => line.length));
    const text = {
        width: longest * TEXT * 0.58,
        height: lines.length * TEXT * 1.2,
    };
    const padding = 15 * SCALE;
    let width = text.width + 4 * padding;
    let height = text.height + 2 * padding;
    // Mermaid's own rules: a diamond's side is the label's width plus its height plus padding (question.ts), a circle
    // fits the label's width plus padding (circle.ts), a hexagon adds a quarter of its height on each side.
    if (shape === "Diamond")
        width = height = text.width + text.height + 2 * padding;
    if (shape === "Circle") width = height = text.width + 2 * padding;
    if (shape === "Hexagon") width = text.width + 2 * padding + height / 2;
    if (shape === "Cylinder") height += 2 * padding;
    return { width: Math.round(width), height: Math.round(height) };
}

function css(declarations) {
    const out = {};
    for (const declaration of declarations ?? []) {
        const [key, ...rest] = declaration.split(":");
        if (key && rest.length) out[key.trim()] = rest.join(":").trim();
    }
    return out;
}

const px = (value) => Number.parseFloat(value);

/** `#rrggbb` with every channel moved by `by`, clamped. */
const shade = (hex, by) =>
    `#${[1, 3, 5]
        .map((i) =>
            Math.min(
                255,
                Math.max(0, Number.parseInt(hex.slice(i, i + 2), 16) + by),
            )
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;

function elementStyle(props, ignored) {
    const style = {};
    for (const [key, value] of Object.entries(props)) {
        if (key === "fill") style.background = value;
        else if (key === "stroke") style.stroke = value;
        else if (key === "stroke-width") style.strokeWidth = px(value);
        else if (key === "color") style.color = value;
        else if (key === "font-size") style.fontSize = px(value);
        else if (key === "stroke-dasharray") style.border = "Dashed";
        else ignored.add(key);
    }
    return style;
}

function relationshipStyle(props, ignored) {
    const style = {};
    for (const [key, value] of Object.entries(props)) {
        if (key === "stroke") style.color = value;
        else if (key === "stroke-width") style.thickness = px(value);
        else if (key === "stroke-dasharray") style.style = "Dashed";
        else if (key !== "fill") ignored.add(key);
    }
    return style;
}

const DIRECTIONS = {
    TB: "TopBottom",
    TD: "TopBottom",
    BT: "BottomTop",
    LR: "LeftRight",
    RL: "RightLeft",
};

function routingFor(curve) {
    if (!curve) return undefined;
    if (curve === "linear") return "Direct";
    if (curve.startsWith("step")) return "Orthogonal";
    return "Curved";
}

const plain = (label) =>
    String(label ?? "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/^"|"$/g, "");

/**
 * Replaces every image view that carries a Mermaid flowchart with a custom view of the same key. Warns about what it
 * leaves out; anything it can't read stays an image view.
 */
export function readMermaidDiagrams(workspace) {
    const views = workspace.views ?? {};
    const imageViews = views.imageViews ?? [];
    if (!imageViews.length) return workspace;
    views.configuration ??= {};
    const configuration = views.configuration;
    configuration.styles ??= {};
    const styles = configuration.styles;
    styles.elements ??= [];
    styles.relationships ??= [];
    workspace.model ??= {};
    const model = workspace.model;
    model.properties ??= {};
    model.properties["structurizr.groupSeparator"] ??= "/";
    const separator = model.properties["structurizr.groupSeparator"];
    model.customElements ??= [];
    views.customViews ??= [];

    const kept = [];
    for (const view of imageViews) {
        const mermaidUrl =
            view.properties?.["mermaid.url"] ??
            configuration.properties?.["mermaid.url"];
        const sources = FIELDS.map((f) => decodeMermaid(view[f], mermaidUrl));
        const source = sources.find((s) => s !== undefined);
        if (source === undefined) {
            kept.push(view);
            continue;
        }
        let parsed;
        try {
            parsed = read(source);
        } catch (error) {
            process.stderr.write(
                `warning: Mermaid diagram "${view.key}": ${error.message.split("\n")[0]}\n`,
            );
            kept.push(view);
            continue;
        }
        if (parsed.kind !== "flowchart") {
            kept.push(view);
            continue;
        }
        const ignored = new Set();
        const { nodes, edges } = parsed.db.getData();
        const prefix = `mermaid:${view.key}:`;
        const id = (nodeId) => `${prefix}${nodeId}`;
        const tag = (name) => `Mermaid:${view.key}:${name}`;
        const config = parsed.config ?? {};
        const theme = config.themeVariables ?? {};
        const themeTag = tag("theme");
        // PROTOTYPE (issue 184): a silent source starts from the branding's primary color and Orthogonal routing,
        // beneath the workspace's own Element, Relationship and Mermaid styles.
        const silent = config.theme === undefined && !config.themeVariables;
        const primary = workspace.properties?.["renderizr.primaryColor"];
        if (
            silent &&
            !styles.elements.some((s) => s.tag === "Mermaid:primary")
        ) {
            for (const [colorScheme, fill] of [
                ["Light", primary ?? "#145b9e"],
                ["Dark", primary ?? "#1168bd"],
            ])
                styles.elements.push({
                    tag: "Mermaid:primary",
                    colorScheme,
                    background: fill,
                    stroke: shade(fill, -50),
                    color: "#ffffff",
                });
            styles.relationships.push({
                tag: "Mermaid:routing",
                routing: "Orthogonal",
            });
        }
        const themed =
            theme.primaryColor ||
            theme.primaryBorderColor ||
            theme.primaryTextColor;
        if (themed) {
            styles.elements.push({
                tag: themeTag,
                ...(theme.primaryColor && { background: theme.primaryColor }),
                ...(theme.primaryBorderColor && {
                    stroke: theme.primaryBorderColor,
                }),
                ...(theme.primaryTextColor && {
                    color: theme.primaryTextColor,
                }),
            });
        }
        const routing = routingFor(config.flowchart?.curve ?? config.curve);
        const edgeTag = tag("edges");
        styles.relationships.push({
            tag: edgeTag,
            ...(theme.lineColor && { color: theme.lineColor }),
            ...(routing && { routing }),
        });

        // Group paths, so nested subgraphs become nested groups.
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const groupPath = (node) => {
            const names = [];
            let parent = node.parentId && byId.get(node.parentId);
            while (parent) {
                names.unshift(plain(parent.label) || parent.id);
                parent = parent.parentId && byId.get(parent.parentId);
            }
            return names.length ? names.join(separator) : undefined;
        };

        // A subgraph's own `direction`, by its group path.
        const directions = {};
        for (const subgraph of parsed.db.getSubGraphs()) {
            const node = byId.get(subgraph.id);
            if (!subgraph.dir || !node) continue;
            const path = [groupPath(node), plain(node.label) || node.id]
                .filter(Boolean)
                .join(separator);
            directions[path] = DIRECTIONS[subgraph.dir];
        }

        const elements = [];
        for (const node of nodes) {
            if (node.isGroup) continue;
            const shape = SHAPES[node.shape] ?? "Box";
            if (!SHAPES[node.shape]) ignored.add(`shape "${node.shape}"`);
            const name = plain(node.label) || node.id;
            const tags = [
                ...(silent ? ["Mermaid:primary"] : []),
                "Element",
                "Mermaid",
                `Mermaid:shape:${shape}`,
            ];
            styles.elements.some((s) => s.tag === `Mermaid:shape:${shape}`) ||
                styles.elements.push({
                    tag: `Mermaid:shape:${shape}`,
                    shape,
                    fontSize: FONT_SIZE,
                    metadata: false,
                    description: false,
                });
            if (themed) tags.push(themeTag);
            const classes = node.cssClasses
                .split(" ")
                .filter((c) => c && c !== "default" && c !== "clickable");
            for (const className of classes) {
                const classTag = tag(`class:${className}`);
                tags.push(classTag);
                if (!styles.elements.some((s) => s.tag === classTag)) {
                    const definition = parsed.db.getClasses().get(className);
                    styles.elements.push({
                        tag: classTag,
                        ...elementStyle(css(definition?.styles), ignored),
                    });
                }
            }
            const sizeTag = tag(`node:${node.id}`);
            tags.push(sizeTag);
            styles.elements.push({
                tag: sizeTag,
                ...sizeFor(name, shape),
                ...elementStyle(css(node.cssStyles), ignored),
            });
            elements.push({
                id: id(node.id),
                name,
                tags: tags.join(","),
                ...(node.link && { url: node.link }),
                ...(groupPath(node) && { group: groupPath(node) }),
                properties: { "renderizr.mermaid": view.key },
            });
        }

        const relationships = [];
        edges.forEach((edge, index) => {
            if (!byId.has(edge.start) || !byId.has(edge.end)) return;
            if (byId.get(edge.start).isGroup || byId.get(edge.end).isGroup) {
                ignored.add("edges to subgraphs");
                return;
            }
            if (
                edge.arrowTypeStart !== "none" ||
                edge.arrowTypeEnd !== "arrow_point"
            ) {
                ignored.add(
                    `arrow ends ${edge.arrowTypeStart}/${edge.arrowTypeEnd}`,
                );
            }
            const tags = [
                ...(silent ? ["Mermaid:routing"] : []),
                "Relationship",
                "Mermaid",
                edgeTag,
            ];
            const pattern = edge.pattern ?? "normal";
            const lineTag = `Mermaid:line:${pattern}`;
            tags.push(lineTag);
            if (!styles.relationships.some((s) => s.tag === lineTag)) {
                styles.relationships.push({
                    tag: lineTag,
                    style: pattern === "dotted" ? "Dotted" : "Solid",
                    ...(pattern === "thick" && { thickness: 4 }),
                    metadata: false,
                });
            }
            if (edge.style?.length) {
                const linkTag = tag(`link:${index}`);
                tags.push(linkTag);
                styles.relationships.push({
                    tag: linkTag,
                    ...relationshipStyle(css(edge.style), ignored),
                });
            }
            relationships.push({
                id: `${prefix}edge:${index}`,
                sourceId: id(edge.start),
                destinationId: id(edge.end),
                description: plain(edge.label),
                tags: tags.join(","),
            });
        });

        for (const element of elements) {
            const own = relationships.filter((r) => r.sourceId === element.id);
            if (own.length) element.relationships = own;
        }
        model.customElements.push(...elements);

        const spacing = config.flowchart ?? {};
        views.customViews.push({
            key: view.key,
            order: view.order,
            title: view.title ?? parsed.title,
            description: view.description,
            properties: {
                ...view.properties,
                "renderizr.mermaid": "true",
                "renderizr.mermaid.directions": JSON.stringify(directions),
            },
            elements: elements.map((e) => ({ id: e.id, x: 0, y: 0 })),
            relationships: relationships.map((r) => ({ id: r.id })),
            automaticLayout: {
                implementation: "Dagre",
                rankDirection:
                    DIRECTIONS[parsed.db.getDirection()] ?? "TopBottom",
                rankSeparation: (spacing.rankSpacing ?? 50) * SCALE,
                nodeSeparation: (spacing.nodeSpacing ?? 50) * SCALE,
                edgeSeparation: 20 * SCALE,
                vertices: false,
            },
        });
        if (ignored.size) {
            process.stderr.write(
                `warning: Mermaid diagram "${view.key}": Renderizr supports only a subset of Mermaid; ignored: ${[...ignored].join(", ")}\n`,
            );
        }
    }
    views.imageViews = kept;
    return workspace;
}
