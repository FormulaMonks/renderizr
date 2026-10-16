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
        if (parsed.kind === "er") {
            readErd(workspace, view, parsed);
            continue;
        }
        if (parsed.kind === "sequence") {
            readSequence(workspace, view, parsed);
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

// PROTOTYPE (issue 192): Mermaid's cardinalities onto end marker names. Mermaid names an edge's ends backwards:
// `cardA` sits at entity B and `cardB` at entity A.
const CARDINALITIES = {
    ONLY_ONE: "one",
    ZERO_OR_ONE: "zeroOrOne",
    ONE_OR_MORE: "oneOrMore",
    ZERO_OR_MORE: "zeroOrMore",
    MD_PARENT: "parent",
};

/**
 * PROTOTYPE (issue 192): an ERD becomes a custom view of entities, each carrying its attributes as a property the
 * page draws rows from, and relationships carrying their end markers. The page sizes every entity.
 */
function readErd(workspace, view, parsed) {
    const { model, views } = workspace;
    const styles = views.configuration.styles;
    const prefix = `mermaid:${view.key}:`;
    const config = parsed.config ?? {};
    const silent = config.theme === undefined && !config.themeVariables;
    const primary = workspace.properties?.["renderizr.primaryColor"];
    if (silent && !styles.elements.some((s) => s.tag === "Mermaid:primary")) {
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
    if (!styles.elements.some((s) => s.tag === "Mermaid:entity"))
        styles.elements.push({
            tag: "Mermaid:entity",
            shape: "Box",
            fontSize: FONT_SIZE,
            metadata: false,
            description: false,
        });
    if (!styles.relationships.some((s) => s.tag === "Mermaid:nonIdentifying"))
        styles.relationships.push(
            { tag: "Mermaid:nonIdentifying", style: "Dashed" },
            { tag: "Mermaid:identifying", style: "Solid" },
        );
    const entities = parsed.db.getEntities();
    const byId = new Map([...entities.values()].map((e) => [e.id, e]));
    const elements = [];
    for (const [name, entity] of entities) {
        elements.push({
            id: `${prefix}${entity.id}`,
            name: entity.alias || plain(entity.label) || name,
            tags: [
                ...(silent ? ["Mermaid:primary"] : []),
                "Element",
                "Mermaid",
                "Mermaid:entity",
            ].join(","),
            properties: {
                "renderizr.mermaid": view.key,
                "renderizr.mermaid.attributes": JSON.stringify(
                    entity.attributes.map(({ type, name, keys, comment }) => ({
                        type,
                        name,
                        keys,
                        comment: plain(comment),
                    })),
                ),
            },
        });
    }
    const relationships = parsed.db
        .getRelationships()
        .flatMap((relationship, index) => {
            if (
                !byId.has(relationship.entityA) ||
                !byId.has(relationship.entityB)
            )
                return [];
            const { cardA, cardB, relType } = relationship.relSpec;
            return [
                {
                    id: `${prefix}edge:${index}`,
                    sourceId: `${prefix}${relationship.entityA}`,
                    destinationId: `${prefix}${relationship.entityB}`,
                    description: plain(relationship.roleA),
                    tags: [
                        ...(silent ? ["Mermaid:routing"] : []),
                        "Relationship",
                        "Mermaid",
                        relType === "NON_IDENTIFYING"
                            ? "Mermaid:nonIdentifying"
                            : "Mermaid:identifying",
                    ].join(","),
                    properties: {
                        "renderizr.mermaid.start":
                            CARDINALITIES[cardB] ?? "none",
                        "renderizr.mermaid.end": CARDINALITIES[cardA] ?? "none",
                    },
                },
            ];
        });
    for (const element of elements) {
        const own = relationships.filter((r) => r.sourceId === element.id);
        if (own.length) element.relationships = own;
    }
    model.customElements.push(...elements);
    // Mermaid's ERD spacing defaults (140 between nodes, 80 between ranks).
    const spacing = { nodeSpacing: 140, rankSpacing: 80, ...config.er };
    views.customViews.push({
        key: view.key,
        order: view.order,
        title: view.title ?? parsed.title,
        description: view.description,
        properties: {
            ...view.properties,
            "renderizr.mermaid": "true",
            "renderizr.mermaid.erd": "true",
            "renderizr.mermaid.directions": "{}",
        },
        elements: elements.map((e) => ({ id: e.id, x: 0, y: 0 })),
        relationships: relationships.map((r) => ({ id: r.id })),
        automaticLayout: {
            implementation: "Dagre",
            rankDirection: DIRECTIONS[parsed.db.getDirection()] ?? "TopBottom",
            rankSeparation: (spacing.rankSpacing ?? 50) * SCALE,
            nodeSeparation: (spacing.nodeSpacing ?? 50) * SCALE,
            edgeSeparation: 20 * SCALE,
            vertices: false,
        },
    });
}

// PROTOTYPE (issue 197): a sequence diagram's line types (sequenceDb's LINETYPE) onto end markers and dotted lines.
// Half arrows (41 to 58) fall back: a solid half head draws as an arrow, a barb as an open arrow, at the end the
// syntax puts it.
const LINES = {
    0: ["none", "arrow", false],
    1: ["none", "arrow", true],
    3: ["none", "cross", false],
    4: ["none", "cross", true],
    5: ["none", "none", false],
    6: ["none", "none", true],
    24: ["none", "openArrow", false],
    25: ["none", "openArrow", true],
    33: ["arrow", "arrow", false],
    34: ["arrow", "arrow", true],
    41: ["none", "arrow", false],
    42: ["none", "arrow", false],
    43: ["none", "openArrow", false],
    44: ["none", "openArrow", false],
    45: ["arrow", "none", false],
    46: ["arrow", "none", false],
    47: ["openArrow", "none", false],
    48: ["openArrow", "none", false],
    51: ["none", "arrow", true],
    52: ["none", "arrow", true],
    53: ["none", "openArrow", true],
    54: ["none", "openArrow", true],
    55: ["arrow", "none", true],
    56: ["arrow", "none", true],
    57: ["openArrow", "none", true],
    58: ["openArrow", "none", true],
};

const FRAGMENTS = {
    10: ["open", "loop"],
    11: ["close"],
    12: ["open", "alt"],
    13: ["section", "else"],
    14: ["close"],
    15: ["open", "opt"],
    16: ["close"],
    19: ["open", "par"],
    20: ["section", "and"],
    21: ["close"],
    32: ["open", "par"],
    22: ["open", "rect"],
    23: ["close"],
    27: ["open", "critical"],
    28: ["section", "option"],
    29: ["close"],
    30: ["open", "break"],
    31: ["close"],
};

const PARTICIPANT_SHAPES = {
    participant: "Box",
    actor: "Person",
    database: "Cylinder",
    queue: "Pipe",
};

// --- Mermaid's color helpers (khroma), enough to derive the sequence variables of the base theme ---

function toHsl(hex) {
    const [r, g, b] = [1, 3, 5].map(
        (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h =
        max === r
            ? (g - b) / d + (g < b ? 6 : 0)
            : max === g
              ? (b - r) / d + 2
              : (r - g) / d + 4;
    return { h: h * 60, s: s * 100, l: l * 100 };
}

function toHex({ h, s, l }) {
    const hue = ((h % 360) + 360) % 360;
    const sat = Math.min(100, Math.max(0, s)) / 100;
    const light = Math.min(100, Math.max(0, l)) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - c / 2;
    const [r, g, b] =
        hue < 60
            ? [c, x, 0]
            : hue < 120
              ? [x, c, 0]
              : hue < 180
                ? [0, c, x]
                : hue < 240
                  ? [0, x, c]
                  : hue < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return `#${[r, g, b]
        .map((v) =>
            Math.round((v + m) * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

const adjust = (hex, { h = 0, s = 0, l = 0 }) => {
    const c = toHsl(hex);
    return toHex({ h: c.h + h, s: c.s + s, l: c.l + l });
};

// The sequence variables of each named theme, as Mermaid resolves them (research for issue 195).
const NAMED_PALETTES = {
    default: {
        actorBkg: "#ECECFF",
        actorBorder: "#9370DB",
        actorTextColor: "#000000",
        actorLineColor: "#9370DB",
        signalColor: "#333333",
        signalTextColor: "#333333",
        labelBoxBkgColor: "#ECECFF",
        labelBoxBorderColor: "#9370DB",
        labelTextColor: "#000000",
        loopTextColor: "#000000",
        noteBkgColor: "#fff5ad",
        noteBorderColor: "#aaaa33",
        noteTextColor: "#000000",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#f9ffec",
    },
    dark: {
        actorBkg: "#1f2020",
        actorBorder: "#cccccc",
        actorTextColor: "#d3d3d3",
        actorLineColor: "#cccccc",
        signalColor: "#d3d3d3",
        signalTextColor: "#d3d3d3",
        labelBoxBkgColor: "#1f2020",
        labelBoxBorderColor: "#cccccc",
        labelTextColor: "#d3d3d3",
        loopTextColor: "#d3d3d3",
        noteBkgColor: "#474949",
        noteBorderColor: "#2f2f2f",
        noteTextColor: "#b8b6b6",
        activationBkgColor: "#474949",
        activationBorderColor: "#cccccc",
        sequenceNumberColor: "#000000",
        rectBkgColor: "#201f1f",
    },
    forest: {
        actorBkg: "#cde498",
        actorBorder: "#a6cf47",
        actorTextColor: "#000000",
        actorLineColor: "#a6cf47",
        signalColor: "#333333",
        signalTextColor: "#333333",
        labelBoxBkgColor: "#cde498",
        labelBoxBorderColor: "#326932",
        labelTextColor: "#000000",
        loopTextColor: "#000000",
        noteBkgColor: "#fff5ad",
        noteBorderColor: "#6eaa49",
        noteTextColor: "#000000",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#e1efc0",
    },
    neutral: {
        actorBkg: "#eeeeee",
        actorBorder: "#d4d4d4",
        actorTextColor: "#333333",
        actorLineColor: "#d4d4d4",
        signalColor: "#333333",
        signalTextColor: "#333333",
        labelBoxBkgColor: "#eeeeee",
        labelBoxBorderColor: "#d4d4d4",
        labelTextColor: "#333333",
        loopTextColor: "#333333",
        noteBkgColor: "#666666",
        noteBorderColor: "#999999",
        noteTextColor: "#ffffff",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#eeeeee",
    },
};

/** The base theme's sequence variables, derived from `primaryColor` the way `theme-base.js` does. */
function basePalette(vars) {
    const primary = vars.primaryColor ?? "#fff4dd";
    const border = (c) => adjust(c, { s: -40, l: -10 });
    const secondary = adjust(primary, { h: -120 });
    const actorBorder = vars.primaryBorderColor ?? border(primary);
    const text = vars.primaryTextColor ?? "#333333";
    const note = vars.noteBkgColor ?? "#fff5ad";
    return {
        actorBkg: primary,
        actorBorder,
        actorTextColor: text,
        actorLineColor: actorBorder,
        signalColor: vars.textColor ?? "#333333",
        signalTextColor: vars.textColor ?? "#333333",
        labelBoxBkgColor: primary,
        labelBoxBorderColor: actorBorder,
        labelTextColor: text,
        loopTextColor: text,
        noteBkgColor: note,
        noteBorderColor: border(note),
        noteTextColor: "#333333",
        activationBkgColor: secondary,
        activationBorderColor: adjust(secondary, { l: -10 }),
        sequenceNumberColor: "#f4f4f4",
        rectBkgColor: adjust(primary, { h: 180, l: 5 }),
    };
}

/** The sequence variables a source's config sets, or undefined for a silent source. */
function sequencePalette(config) {
    if (config.theme === undefined && !config.themeVariables) return undefined;
    const vars = config.themeVariables ?? {};
    const named =
        config.theme === "base" || !NAMED_PALETTES[config.theme]
            ? basePalette(vars)
            : NAMED_PALETTES[config.theme];
    const palette = { ...named };
    for (const key of Object.keys(palette))
        if (typeof vars[key] === "string") palette[key] = vars[key];
    return palette;
}

/**
 * PROTOTYPE (issue 197): a sequence diagram becomes a custom view of its participants and messages, so the style
 * cascade reaches them, plus a script the page lays out on its own: Mermaid's flat message list with fragments,
 * notes and activations, in order. No Dagre and no router: the page places everything.
 */
function readSequence(workspace, view, parsed) {
    const { model, views } = workspace;
    const styles = views.configuration.styles;
    const prefix = `mermaid:${view.key}:`;
    const config = parsed.config ?? {};
    const sequence = config.sequence ?? {};
    const ignored = new Set();
    const db = parsed.db;
    const silent = config.theme === undefined && !config.themeVariables;
    const palette = sequencePalette(config);
    const primary = workspace.properties?.["renderizr.primaryColor"];
    if (silent && !styles.elements.some((s) => s.tag === "Mermaid:primary")) {
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
    }
    if (!styles.elements.some((s) => s.tag === "Mermaid:participant"))
        styles.elements.push({
            tag: "Mermaid:participant",
            // A little smaller than a flowchart node's name.
            fontSize: 14,
            metadata: false,
            description: false,
        });
    for (const [type, shape] of Object.entries(PARTICIPANT_SHAPES)) {
        const tag = `Mermaid:participant:${type}`;
        if (!styles.elements.some((s) => s.tag === tag))
            styles.elements.push({ tag, shape });
    }
    if (!styles.relationships.some((s) => s.tag === "Mermaid:message:dotted"))
        styles.relationships.push(
            { tag: "Mermaid:message:dotted", style: "Dotted" },
            { tag: "Mermaid:message:solid", style: "Solid" },
        );
    const themeTag = `Mermaid:${view.key}:theme`;
    if (palette) {
        styles.elements.push({
            tag: themeTag,
            background: palette.actorBkg,
            stroke: palette.actorBorder,
            color: palette.actorTextColor,
        });
        styles.relationships.push({
            tag: themeTag,
            color: palette.signalColor,
        });
    }

    const id = (name) => `${prefix}${name}`;
    const actors = db.getActors();
    const elements = [];
    const participants = [];
    for (const [name, actor] of actors) {
        let type = actor.type ?? "participant";
        if (!PARTICIPANT_SHAPES[type]) {
            ignored.add(`participant type "${type}"`);
            type = "participant";
        }
        participants.push({ id: id(name), type });
        elements.push({
            id: id(name),
            name: plain(actor.description) || name,
            tags: [
                ...(silent ? ["Mermaid:primary"] : []),
                "Element",
                "Mermaid",
                "Mermaid:participant",
                `Mermaid:participant:${type}`,
                ...(palette ? [themeTag] : []),
            ].join(","),
            properties: { "renderizr.mermaid": view.key },
        });
    }

    const created = Object.fromEntries(
        [...db.getCreatedActors()].map(([name, index]) => [id(name), index]),
    );
    const destroyed = Object.fromEntries(
        [...db.getDestroyedActors()].map(([name, index]) => [id(name), index]),
    );
    const relationships = [];
    const items = [];
    const text = (value) => plain(value?.text ?? value);
    for (const message of db.getMessages()) {
        const index = Number(message.id);
        const fragment = FRAGMENTS[message.type];
        if (fragment) {
            const [kind, name] = fragment;
            items.push(
                kind === "open"
                    ? {
                          kind,
                          index,
                          fragment: name,
                          title: name === "rect" ? "" : text(message.message),
                          ...(name === "rect" && {
                              color: text(message.message),
                          }),
                      }
                    : kind === "section"
                      ? { kind, index, title: text(message.message) }
                      : { kind, index },
            );
            continue;
        }
        switch (message.type) {
            case 2:
                items.push({
                    kind: "note",
                    index,
                    placement: ["left", "right", "over"][message.placement],
                    from: id(message.from),
                    to: id(message.to ?? message.from),
                    text: text(message.message),
                    wrap: Boolean(message.wrap || config.wrap || sequence.wrap),
                });
                continue;
            case 17:
                items.push({ kind: "activate", index, who: id(message.from) });
                continue;
            case 18:
                items.push({
                    kind: "deactivate",
                    index,
                    who: id(message.from),
                });
                continue;
            case 26:
                items.push({
                    kind: "autonumber",
                    index,
                    start: message.message?.start ?? 1,
                    step: message.message?.step ?? 1,
                    visible: message.message?.visible ?? true,
                });
                continue;
        }
        const line = LINES[message.type];
        if (!line) {
            ignored.add(`line type ${message.type}`);
            continue;
        }
        if (message.type >= 41) ignored.add("half arrows");
        const [start, end, dotted] = line;
        const relationshipId = `${prefix}message:${index}`;
        relationships.push({
            id: relationshipId,
            sourceId: id(message.from),
            destinationId: id(message.to),
            description: text(message.message),
            tags: [
                "Relationship",
                "Mermaid",
                dotted ? "Mermaid:message:dotted" : "Mermaid:message:solid",
                ...(palette ? [themeTag] : []),
            ].join(","),
        });
        const central = message.centralConnection;
        items.push({
            kind: "message",
            index,
            relationship: relationshipId,
            from: id(message.from),
            to: id(message.to),
            start,
            end,
            wrap: Boolean(message.wrap || config.wrap || sequence.wrap),
            ...(central === 59 && { dots: "end" }),
            ...(central === 60 && { dots: "start" }),
            ...(central === 61 && { dots: "both" }),
        });
    }
    if (db.showSequenceNumbers() && !items.some((i) => i.kind === "autonumber"))
        items.unshift({
            kind: "autonumber",
            index: -1,
            start: 1,
            step: 1,
            visible: true,
        });

    for (const key of Object.keys(sequence))
        if (/Font|messageMargin/.test(key)) ignored.add(`sequence.${key}`);
    if (config.look) ignored.add("look");

    for (const element of elements) {
        const own = relationships.filter((r) => r.sourceId === element.id);
        if (own.length) element.relationships = own;
    }
    model.customElements.push(...elements);
    const script = {
        participants,
        boxes: db.getBoxes().map((box) => ({
            title: plain(box.name ?? ""),
            fill: box.fill === "transparent" ? undefined : box.fill,
            participants: box.actorKeys.map(id),
        })),
        created,
        destroyed,
        mirror: sequence.mirrorActors ?? true,
        rightAngles: sequence.rightAngles ?? false,
        palette,
        items,
    };
    views.customViews.push({
        key: view.key,
        order: view.order,
        title: view.title ?? parsed.title,
        description: view.description,
        properties: {
            ...view.properties,
            "renderizr.mermaid": "true",
            "renderizr.mermaid.sequence": JSON.stringify(script),
            "renderizr.mermaid.directions": "{}",
        },
        elements: elements.map((e) => ({ id: e.id, x: 0, y: 0 })),
        relationships: relationships.map((r) => ({ id: r.id })),
    });
    if (ignored.size) {
        process.stderr.write(
            `warning: Mermaid diagram "${view.key}": Renderizr supports only a subset of Mermaid; ignored: ${[...ignored].join(", ")}\n`,
        );
    }
}
