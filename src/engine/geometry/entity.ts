/**
 * PROTOTYPE (issue 192): an ERD entity's box, sized from its header and the
 * attribute rows it shows, and the end markers an ERD edge draws.
 */

import type { MeasureText } from "./boundary";
import type { Point } from "./shapes/types";

export type Attribute = {
    type: string;
    name: string;
    keys: string[];
    comment: string;
};

/** One drawn row: blank cells are columns this state leaves out. */
export type EntityRow = Attribute;

export type EntityLayout = {
    collapsed: boolean;
    /** Whether the header draws a chevron: the entity has an attribute. */
    toggles: boolean;
    headerHeight: number;
    rowHeight: number;
    /** Each column's width; 0 for a column this state leaves out. */
    columns: { type: number; name: number; keys: number; comment: number };
    rows: EntityRow[];
    nameSize: number;
    rowSize: number;
};

const CELL_PADDING = 12;
const HEADER_PADDING = 15;
export const CHEVRON_ROOM = 32;

const isKey = (attribute: Attribute) =>
    attribute.keys.includes("PK") || attribute.keys.includes("FK");

/**
 * The entity collapsed shows its `PK` and `FK` attributes by name and keys;
 * expanded shows every attribute, its comment only with descriptions on.
 */
export function layOutEntity(
    name: string,
    attributes: Attribute[],
    collapsed: boolean,
    comments: boolean,
    fontSize: number,
    measure: MeasureText,
): { width: number; height: number; entity: EntityLayout } {
    const nameSize = fontSize * 1.4;
    const rowSize = fontSize * 1.1;
    const rows = (collapsed ? attributes.filter(isKey) : attributes).map(
        (attribute) => ({
            type: collapsed ? "" : attribute.type,
            name: attribute.name,
            keys: attribute.keys,
            comment: collapsed || !comments ? "" : attribute.comment,
        }),
    );
    const column = (texts: string[]) => {
        const widest = Math.max(
            0,
            ...texts.map((text) => (text ? measure(text, rowSize, false) : 0)),
        );
        return widest > 0 ? Math.ceil(widest) + 2 * CELL_PADDING : 0;
    };
    const columns = {
        type: column(rows.map((row) => row.type)),
        name: column(rows.map((row) => row.name)),
        keys: column(rows.map((row) => row.keys.join(", "))),
        comment: column(rows.map((row) => row.comment)),
    };
    const toggles = attributes.length > 0;
    const header =
        Math.ceil(measure(name, nameSize, false)) +
        2 * HEADER_PADDING * 2 +
        (toggles ? 2 * CHEVRON_ROOM : 0);
    const rowsWidth =
        columns.type + columns.name + columns.keys + columns.comment;
    const headerHeight = Math.round(nameSize * 1.2 + 2 * HEADER_PADDING);
    const rowHeight = Math.round(rowSize * 1.8);
    const width = Math.max(header, rowsWidth);
    // The name column takes whatever the header leaves over.
    if (rows.length > 0 && width > rowsWidth) columns.name += width - rowsWidth;
    return {
        width,
        height: headerHeight + rows.length * rowHeight,
        entity: {
            collapsed,
            toggles,
            headerHeight,
            rowHeight,
            columns,
            rows,
            nameSize,
            rowSize,
        },
    };
}

export type EndMarker =
    | "none"
    | "one"
    | "zeroOrOne"
    | "oneOrMore"
    | "zeroOrMore";

/**
 * A cardinality at `tip`, the point the edge meets its entity, opening
 * along `away` (the unit vector from the tip back along the edge). The
 * stroke part is drawn as lines; the circles take the canvas background so
 * the line never shows through them.
 */
export function endMarkerPaths(
    marker: string,
    tip: Point,
    away: Point,
    thickness: number,
): { stroke: string; circles: string } {
    const s = Math.max(1, thickness / 2);
    const half = 9 * s;
    const at = (along: number, across: number) => ({
        x: tip.x + away.x * along - away.y * across,
        y: tip.y + away.y * along + away.x * across,
    });
    const line = (a: Point, b: Point) =>
        `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    const bar = (along: number) => line(at(along, -half), at(along, half));
    const foot = () =>
        [
            line(at(15 * s, 0), at(0, -half)),
            line(at(15 * s, 0), at(0, 0)),
            line(at(15 * s, 0), at(0, half)),
        ].join("");
    const circle = (along: number) => {
        const c = at(along, 0);
        const r = 5 * s;
        return `M${(c.x - r).toFixed(2)},${c.y.toFixed(2)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    };
    switch (marker) {
        case "one":
            return { stroke: bar(8 * s) + bar(14 * s), circles: "" };
        case "zeroOrOne":
            return { stroke: bar(8 * s), circles: circle(20 * s) };
        case "oneOrMore":
            return { stroke: foot() + bar(20 * s), circles: "" };
        case "zeroOrMore":
            return { stroke: foot(), circles: circle(23 * s) };
        default:
            return { stroke: "", circles: "" };
    }
}
