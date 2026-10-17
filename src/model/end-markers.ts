/**
 * The End markers a Mermaid edge draws at either end (spec: End markers),
 * as names. The model types every Mermaid end with them, and the engine
 * draws each one (`engine/geometry/markers.ts`).
 */

/** Every End marker, `none` first. */
export const END_MARKERS = [
    "none",
    "arrow",
    "openArrow",
    "circle",
    "cross",
    "zeroOrOne",
    "one",
    "zeroOrMore",
    "oneOrMore",
] as const;

/** An End marker's name. */
export type EndMarker = (typeof END_MARKERS)[number];

/** Whether `name` names an End marker. */
export const isEndMarker = (name: string): name is EndMarker =>
    (END_MARKERS as readonly string[]).includes(name);
