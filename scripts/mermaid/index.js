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

// Shapes whose content area is smaller than their box, so the label needs a bigger box.
const ROOMY = { Diamond: 1.7, Circle: 1.45, Hexagon: 1.25, Cylinder: 1.1 };

const FONT_SIZE = 24;
const NAME = FONT_SIZE * 1.4;

/** A rough box for a label, measured with an average glyph width (no canvas in the build). */
function sizeFor(label, shape) {
    const lines = label.split("\n");
    const longest = Math.max(...lines.map((line) => line.length));
    const scale = ROOMY[shape] ?? 1;
    let width = Math.round((longest * NAME * 0.62 + 70) * scale);
    let height = Math.round((lines.length * NAME * 1.2 + 70) * scale);
    if (shape === "Circle" || shape === "Diamond") {
        width = height = Math.max(width, height);
    }
    return { width: Math.max(width, 160), height: Math.max(height, 100) };
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

        const elements = [];
        for (const node of nodes) {
            if (node.isGroup) continue;
            const shape = SHAPES[node.shape] ?? "Box";
            if (!SHAPES[node.shape]) ignored.add(`shape "${node.shape}"`);
            const name = plain(node.label) || node.id;
            const tags = ["Element", "Mermaid", `Mermaid:shape:${shape}`];
            styles.elements.some((s) => s.tag === `Mermaid:shape:${shape}`) ||
                styles.elements.push({
                    tag: `Mermaid:shape:${shape}`,
                    shape,
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
            const tags = ["Relationship", "Mermaid", edgeTag];
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
            properties: view.properties,
            elements: elements.map((e) => ({ id: e.id, x: 0, y: 0 })),
            relationships: relationships.map((r) => ({ id: r.id })),
            automaticLayout: {
                implementation: "Dagre",
                rankDirection:
                    DIRECTIONS[parsed.db.getDirection()] ?? "TopBottom",
                ...(spacing.rankSpacing && {
                    rankSeparation: spacing.rankSpacing,
                }),
                ...(spacing.nodeSpacing && {
                    nodeSeparation: spacing.nodeSpacing,
                }),
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
