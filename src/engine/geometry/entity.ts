/**
 * An ERD entity as plain numbers (spec: ERD entities): its box, collapsed
 * or expanded, and everything drawn inside it, the attribute rows' tints
 * included, as literal colors the canvas and an export both paint.
 *
 * Collapsed, every entity of a diagram draws at one size in a C4 element's
 * 3:2 proportions, its name bold at the center over its `PK` and `FK`
 * attributes. Expanded, a header holds the name, a row per attribute
 * follows in Mermaid's column order (type, name, keys, comment), and a band
 * at the bottom holds the toggle. An entity without attributes never
 * expands and draws no toggle.
 */

import type { MermaidAttribute } from "../../model/index";
import type { MeasureText } from "./boundary";
import type { Size } from "./bounds";
import { LINE_HEIGHT, NAME_SCALE } from "./label";

/** The space either side of a cell's text. */
export const CELL_PADDING = 12;
/** The space around the name, in the header and either side of the box. */
export const HEADER_PADDING = 15;
/** The band at the bottom of an entity that holds its toggle. */
export const TOGGLE_ROOM = 40;
/** The toggle's diameter. */
export const TOGGLE_SIZE = 20;
/** How much larger than the base font an attribute row draws. */
const ROW_SCALE = 1.1;
/** A row's height, in multiples of its font size. */
const ROW_LEADING = 1.8;
/** The gap between a collapsed entity's name and its key lines. */
const KEYS_GAP = 10;
/** A collapsed key line's height, in multiples of its font size. */
const KEY_LEADING = 1.4;
/** A C4 element's proportions, which a collapsed entity keeps. */
const ASPECT = 1.5;

/** The columns of an expanded entity, in Mermaid's order. */
export const ENTITY_COLUMNS = ["type", "name", "keys", "comment"] as const;
export type EntityColumn = (typeof ENTITY_COLUMNS)[number];

/** One line of text inside an entity, relative to its box's top-left. */
export type EntityText = {
    text: string;
    /** The column's left edge and width; `middle` centers in it. */
    x: number;
    width: number;
    /** The top of its line box, `LINE_HEIGHT` times its size tall. */
    y: number;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    color: string;
    /** Below 1 for the type and comment columns, which read quieter. */
    opacity: number;
    align: "start" | "middle";
    /** Which part of the entity it is, for a reader of the export. */
    part: "name" | "key" | EntityColumn;
};

/** A row's tinted backing, relative to the box's top-left. */
export type EntityRowBox = {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    /** The line along its top, between it and what sits above. */
    rule: string;
};

export type EntityLayout = {
    collapsed: boolean;
    /** Whether it draws a toggle: it has an attribute. */
    toggles: boolean;
    /** Each column's width; 0 for one this state leaves out. */
    columns: Record<EntityColumn, number>;
    /** The rows' backings, painted over the box's fill, top to bottom. */
    rows: EntityRowBox[];
    /** Every line of text, the name first. */
    texts: EntityText[];
    /** The toggle's center and diameter; absent without attributes. */
    toggle?: { x: number; y: number; size: number };
};

/** What sizing and drawing one entity needs. */
export type EntityInput = {
    name: string;
    attributes: readonly MermaidAttribute[];
    collapsed: boolean;
    /** Whether the comment column shows: the descriptions toggle. */
    comments: boolean;
    fontSize: number;
    /** Whether the name draws bold, as the source's `font-weight` says. */
    bold: boolean;
    family?: string;
    measure: MeasureText;
    /** The size every collapsed entity of the diagram draws at. */
    collapsedSize?: Size;
    /** The box's fill and text color, which the header and band keep. */
    fill: string;
    color: string;
    /** The box's border, which the rows stay inside. */
    strokeWidth: number;
    /** The source's row colors, which win over the tints of the fill. */
    rowColors?: { odd?: string; even?: string };
};

/** Whether an attribute shows collapsed: a `PK` or an `FK`, never a `UK` alone. */
export const isKey = (attribute: MermaidAttribute) =>
    attribute.keys.includes("PK") || attribute.keys.includes("FK");

/** A collapsed key line: the name and its keys, `id [PK]`. */
const keyLine = (attribute: MermaidAttribute) =>
    `${attribute.name} [${attribute.keys.join(", ")}]`;

/**
 * The box one collapsed entity needs for its name, its key attributes and
 * its toggle's band above and below, in a C4 element's proportions. The
 * diagram draws every collapsed entity at the largest of these.
 */
export function collapsedContent(
    input: Pick<
        EntityInput,
        "name" | "attributes" | "fontSize" | "bold" | "family" | "measure"
    >,
): Size {
    const { name, attributes, fontSize, bold, family, measure } = input;
    const nameSize = fontSize * NAME_SCALE;
    const rowSize = fontSize * ROW_SCALE;
    const keys = attributes.filter(isKey);
    const widest = Math.max(
        measure(name, nameSize, bold, family),
        ...keys.map((key) => measure(keyLine(key), rowSize, false, family)),
    );
    const content =
        nameSize * LINE_HEIGHT +
        (keys.length ? KEYS_GAP + keys.length * rowSize * KEY_LEADING : 0);
    const width = Math.ceil(widest) + 4 * HEADER_PADDING;
    const height = Math.ceil(content + 2 * HEADER_PADDING + 2 * TOGGLE_ROOM);
    return {
        width: Math.round(Math.max(width, height * ASPECT)),
        height: Math.round(Math.max(height, width / ASPECT)),
    };
}

/** The toggle's place at the bottom center of a box `size`. */
const togglePlace = ({ width, height }: Size) => ({
    x: width / 2,
    y: height - TOGGLE_ROOM / 2,
    size: TOGGLE_SIZE,
});

/**
 * One entity laid out: its box's size and what draws inside it. A
 * collapsed entity, and one without attributes in any state, takes
 * `collapsedSize`, or its own `collapsedContent` without one.
 */
export function layOutEntity(
    input: EntityInput,
): Size & { entity: EntityLayout } {
    const { name, attributes, fontSize, bold, family, measure, color } = input;
    const nameSize = fontSize * NAME_SCALE;
    const rowSize = fontSize * ROW_SCALE;
    const toggles = attributes.length > 0;
    const noColumns = { type: 0, name: 0, keys: 0, comment: 0 };
    const nameText = (y: number, width: number): EntityText => ({
        text: name,
        x: 0,
        width,
        y,
        fontSize: nameSize,
        bold,
        italic: false,
        color,
        opacity: 1,
        align: "middle",
        part: "name",
    });

    if (input.collapsed || !toggles) {
        const size = input.collapsedSize ?? collapsedContent(input);
        const keys = attributes.filter(isKey);
        const keyHeight = rowSize * KEY_LEADING;
        const content =
            nameSize * LINE_HEIGHT +
            (keys.length ? KEYS_GAP + keys.length * keyHeight : 0);
        const top = (size.height - content) / 2;
        const keysTop = top + nameSize * LINE_HEIGHT + KEYS_GAP;
        return {
            ...size,
            entity: {
                collapsed: true,
                toggles,
                columns: noColumns,
                rows: [],
                texts: [
                    nameText(top, size.width),
                    ...keys.map(
                        (key, index): EntityText => ({
                            text: keyLine(key),
                            x: 0,
                            width: size.width,
                            // Centered in its taller line, as CSS centers it.
                            y:
                                keysTop +
                                index * keyHeight +
                                (keyHeight - rowSize * LINE_HEIGHT) / 2,
                            fontSize: rowSize,
                            bold: false,
                            italic: false,
                            color,
                            opacity: 1,
                            align: "middle",
                            part: "key",
                        }),
                    ),
                ],
                ...(toggles && { toggle: togglePlace(size) }),
            },
        };
    }

    const cellText: Record<EntityColumn, (a: MermaidAttribute) => string> = {
        type: (a) => a.type,
        name: (a) => a.name,
        keys: (a) => a.keys.join(", "),
        comment: (a) => (input.comments ? a.comment : ""),
    };
    const column = (cell: EntityColumn) => {
        const widest = Math.max(
            0,
            ...attributes.map((a) => {
                const text = cellText[cell](a);
                return text
                    ? measure(text, rowSize, cell === "keys", family)
                    : 0;
            }),
        );
        return widest > 0 ? Math.ceil(widest) + 2 * CELL_PADDING : 0;
    };
    const columns = {
        type: column("type"),
        name: column("name"),
        keys: column("keys"),
        comment: column("comment"),
    };
    const headerHeight = Math.round(
        nameSize * LINE_HEIGHT + 2 * HEADER_PADDING,
    );
    const rowHeight = Math.round(rowSize * ROW_LEADING);
    const header =
        Math.ceil(measure(name, nameSize, bold, family)) + 4 * HEADER_PADDING;
    const rowsWidth =
        columns.type + columns.name + columns.keys + columns.comment;
    const width = Math.max(header, rowsWidth);
    // The last column shown takes whatever the header leaves over, so the
    // keys sit right after the name.
    const last = (["comment", "keys", "name", "type"] as const).find(
        (cell) => columns[cell] > 0,
    );
    if (last && width > rowsWidth) columns[last] += width - rowsWidth;
    const height = headerHeight + attributes.length * rowHeight + TOGGLE_ROOM;

    const tints = rowTints(input.fill, input.rowColors);
    const rows: EntityRowBox[] = [];
    const texts: EntityText[] = [
        nameText((headerHeight - nameSize * LINE_HEIGHT) / 2, width),
    ];
    for (const [index, attribute] of attributes.entries()) {
        const y = headerHeight + index * rowHeight;
        // Mermaid counts rows from one, so the first is odd.
        const fill = index % 2 === 0 ? tints.odd : tints.even;
        const inset = input.strokeWidth / 2;
        rows.push({
            x: inset,
            y,
            width: width - 2 * inset,
            height: rowHeight,
            fill,
            rule: tints.rule,
        });
        let x = 0;
        for (const cell of ENTITY_COLUMNS) {
            const cellWidth = columns[cell];
            const text = cellText[cell](attribute);
            if (cellWidth > 0 && text)
                texts.push({
                    text,
                    x: x + CELL_PADDING,
                    width: cellWidth - 2 * CELL_PADDING,
                    y: y + (rowHeight - rowSize * LINE_HEIGHT) / 2,
                    fontSize: rowSize,
                    bold: cell === "keys",
                    italic: cell === "comment",
                    color: tints.text,
                    opacity: cell === "type" || cell === "comment" ? 0.8 : 1,
                    align: "start",
                    part: cell,
                });
            x += cellWidth;
        }
    }
    return {
        width,
        height,
        entity: {
            collapsed: false,
            toggles,
            columns,
            rows,
            texts,
            toggle: togglePlace({ width, height }),
        },
    };
}

/* ---------------- colors */

type Rgb = [number, number, number];

/** A color's channels from hex, `rgb()` or `hsl()`; `undefined` for any other. */
export function parseColor(color: string): Rgb | undefined {
    const value = color.trim().toLowerCase();
    const hex = /^#([\da-f]{3,8})$/.exec(value)?.[1];
    if (hex && (hex.length === 3 || hex.length === 4))
        return [0, 1, 2].map((i) =>
            Number.parseInt(hex[i] + hex[i], 16),
        ) as Rgb;
    if (hex && (hex.length === 6 || hex.length === 8))
        return [0, 2, 4].map((i) =>
            Number.parseInt(hex.slice(i, i + 2), 16),
        ) as Rgb;
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
    if (rgb) return [rgb[1], rgb[2], rgb[3]].map(Number) as Rgb;
    const hsl =
        /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(value);
    if (hsl) {
        const h = Number(hsl[1]) / 360;
        const s = Number(hsl[2]) / 100;
        const l = Number(hsl[3]) / 100;
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const channel = (t: number) => {
            const k = (t + 1) % 1;
            const v =
                k < 1 / 6
                    ? p + (q - p) * 6 * k
                    : k < 1 / 2
                      ? q
                      : k < 2 / 3
                        ? p + (q - p) * (2 / 3 - k) * 6
                        : p;
            return Math.round(v * 255);
        };
        return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
    }
    if (value === "white") return [255, 255, 255];
    if (value === "black") return [0, 0, 0];
    return undefined;
}

const toHex = (rgb: Rgb) =>
    `#${rgb
        .map((c) =>
            Math.round(Math.min(255, Math.max(0, c)))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;

/** `share` of `color` mixed into `base`, as `color-mix(in srgb, …)` does. */
const mix = (color: Rgb, share: number, base: Rgb): string =>
    toHex(color.map((c, i) => c * share + base[i] * (1 - share)) as Rgb);

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
/** What a fill the page can't read tints as. */
const NEUTRAL: Rgb = [128, 128, 128];

/**
 * An expanded entity's row colors: light alternating tints of its fill
 * with dark text mixed from it, in both schemes, unless the source sets
 * `rowOdd` or `rowEven`.
 */
export function rowTints(
    fill: string,
    own: { odd?: string; even?: string } = {},
): { odd: string; even: string; text: string; rule: string } {
    const rgb = parseColor(fill) ?? NEUTRAL;
    return {
        odd: own.odd ?? mix(rgb, 0.18, WHITE),
        even: own.even ?? mix(rgb, 0.26, WHITE),
        text: mix(rgb, 0.4, BLACK),
        rule: mix(rgb, 0.4, WHITE),
    };
}
