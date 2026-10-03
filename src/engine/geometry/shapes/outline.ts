/**
 * The shared mechanics under every shape: building silhouettes out of lines
 * and elliptical arcs, writing them as SVG path data, and casting rays at
 * them. Every shape is lines plus arcs (a rounded corner is a quarter arc), so
 * the ray math is written once here instead of once per shape.
 */

import type {
    Point,
    Rect,
    Segment,
    Shape,
    ShapeGeometry,
    ShapePart,
    Side,
    Span,
} from "./types";

/** How far a hit may miss an endpoint or a range and still count. */
const TOLERANCE = 1e-9;

/** A full turn in radians, for bringing an arc's angles into one range. */
const TURN = 2 * Math.PI;

/* ---------------- building silhouettes */

export const point = (x: number, y: number): Point => ({ x, y });

export const line = (from: Point, to: Point): Segment => ({
    kind: "line",
    from,
    to,
});

export const arc = (
    center: Point,
    rx: number,
    ry: number,
    start: number,
    end: number,
): Segment => ({ kind: "arc", center, rx, ry, start, end });

export const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
): Rect => ({ x, y, width: Math.max(0, width), height: Math.max(0, height) });

export const span = (from: number, to: number): Span => ({ from, to });

/** The first point of a segment. */
export const startOf = (segment: Segment): Point =>
    segment.kind === "line" ? segment.from : pointOnArc(segment, segment.start);

/** The last point of a segment. */
export const endOf = (segment: Segment): Point =>
    segment.kind === "line" ? segment.to : pointOnArc(segment, segment.end);

const pointOnArc = (
    { center, rx, ry }: Segment & { kind: "arc" },
    angle: number,
): Point => ({
    x: center.x + rx * Math.cos(angle),
    y: center.y + ry * Math.sin(angle),
});

/**
 * A rectangle with corners rounded by `radius`, walked clockwise from the
 * start of its top side. The radius is clamped to half the shorter side, as
 * SVG clamps `rx`.
 */
export function roundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): Segment[] {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const right = x + width;
    const bottom = y + height;
    const corner = (cx: number, cy: number, start: number) =>
        r > 0 ? [arc(point(cx, cy), r, r, start, start + Math.PI / 2)] : [];
    return [
        line(point(x + r, y), point(right - r, y)),
        ...corner(right - r, y + r, -Math.PI / 2),
        line(point(right, y + r), point(right, bottom - r)),
        ...corner(right - r, bottom - r, 0),
        line(point(right - r, bottom), point(x + r, bottom)),
        ...corner(x + r, bottom - r, Math.PI / 2),
        line(point(x, bottom - r), point(x, y + r)),
        ...corner(x + r, y + r, Math.PI),
    ].filter((segment) => !isEmptyLine(segment));
}

/** A whole ellipse, as two half arcs (one SVG arc cannot close on itself). */
export const ellipse = (center: Point, rx: number, ry: number): Segment[] => [
    arc(center, rx, ry, 0, Math.PI),
    arc(center, rx, ry, Math.PI, TURN),
];

/** A closed polygon through `points`, in order. */
export const polygon = (points: Point[]): Segment[] =>
    points.map((from, i) => line(from, points[(i + 1) % points.length]));

const isEmptyLine = (segment: Segment) =>
    segment.kind === "line" &&
    segment.from.x === segment.to.x &&
    segment.from.y === segment.to.y;

/* ---------------- path data */

/** A number for path data: three decimals, and never `-0`. */
export const num = (n: number): string =>
    String(Math.round(n * 1000) / 1000 + 0);

const at = ({ x, y }: Point) => `${num(x)} ${num(y)}`;

/**
 * SVG path data for segments that chain end to start: one `M`, then an `L` or
 * an `A` per segment, closed with `Z` unless `open`.
 */
export function pathOf(segments: Segment[], open = false): string {
    if (segments.length === 0) return "";
    const commands = [`M ${at(startOf(segments[0]))}`];
    for (const segment of segments) {
        if (segment.kind === "line") {
            commands.push(`L ${at(segment.to)}`);
            continue;
        }
        const large = segment.end - segment.start > Math.PI ? 1 : 0;
        commands.push(
            `A ${num(segment.rx)} ${num(segment.ry)} 0 ${large} 1 ${at(endOf(segment))}`,
        );
    }
    if (!open) commands.push("Z");
    return commands.join(" ");
}

/* ---------------- assembling a geometry */

/** Everything a shape module works out; `outline` is derived from it. */
export type ShapeDrawing = {
    parts: ShapePart[];
    segments: Segment[];
    content: Rect;
    spans: Record<Side, Span>;
};

/**
 * A finished geometry. It goes through a JSON round trip so that a computed
 * `-0` (from `cos` and `sin` of a quarter turn) is already `0`, and the
 * geometry deep-equals its own serialized copy in the engine report.
 */
export function finish(
    shape: Shape,
    width: number,
    height: number,
    drawing: ShapeDrawing,
): ShapeGeometry {
    return JSON.parse(
        JSON.stringify({
            shape,
            width,
            height,
            parts: drawing.parts,
            outline: pathOf(drawing.segments),
            segments: drawing.segments,
            content: drawing.content,
            spans: drawing.spans,
        }),
    );
}

/* ---------------- rays */

/**
 * The parameters `t ≥ 0` at which the ray `origin + t·direction` meets any of
 * `segments`, in no particular order. A ray running along a straight segment
 * does not count as meeting it; it meets the segments at that one's ends.
 */
export function hits(
    segments: Segment[],
    origin: Point,
    direction: Point,
): number[] {
    const found: number[] = [];
    for (const segment of segments) {
        if (segment.kind === "line") {
            const t = hitLine(segment, origin, direction);
            if (t !== null) found.push(t);
        } else {
            found.push(...hitArc(segment, origin, direction));
        }
    }
    return found;
}

function hitLine(
    { from, to }: Segment & { kind: "line" },
    origin: Point,
    direction: Point,
): number | null {
    const ex = to.x - from.x;
    const ey = to.y - from.y;
    const denominator = direction.x * ey - direction.y * ex;
    if (denominator === 0) return null;
    const ox = from.x - origin.x;
    const oy = from.y - origin.y;
    const t = (ox * ey - oy * ex) / denominator;
    const u = (ox * direction.y - oy * direction.x) / denominator;
    if (t < -TOLERANCE || u < -TOLERANCE || u > 1 + TOLERANCE) return null;
    return Math.max(0, t);
}

function hitArc(
    { center, rx, ry, start, end }: Segment & { kind: "arc" },
    origin: Point,
    direction: Point,
): number[] {
    // Substitute the ray into ((x - cx)/rx)² + ((y - cy)/ry)² = 1.
    const px = (origin.x - center.x) / rx;
    const py = (origin.y - center.y) / ry;
    const dx = direction.x / rx;
    const dy = direction.y / ry;
    const a = dx * dx + dy * dy;
    const b = 2 * (px * dx + py * dy);
    const c = px * px + py * py - 1;
    const discriminant = b * b - 4 * a * c;
    if (a === 0 || discriminant < 0) return [];
    const root = Math.sqrt(discriminant);
    const found: number[] = [];
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        if (t < -TOLERANCE) continue;
        const angle = Math.atan2(py + t * dy, px + t * dx);
        const offset = (((angle - start) % TURN) + TURN) % TURN;
        if (offset <= end - start + TOLERANCE || offset >= TURN - TOLERANCE) {
            found.push(Math.max(0, t));
        }
    }
    return found;
}

/**
 * Where the ray from the box's center toward `toward` leaves the silhouette:
 * the edge end for an edge whose side is not chosen yet. The farthest hit
 * wins, so a ray that leaves Person's body and then crosses the head ends on
 * the head. Returns the center when `toward` is the center.
 */
export function intersect(geometry: ShapeGeometry, toward: Point): Point {
    const center = point(geometry.width / 2, geometry.height / 2);
    const direction = point(toward.x - center.x, toward.y - center.y);
    if (direction.x === 0 && direction.y === 0) return center;
    const found = hits(geometry.segments, center, direction);
    if (found.length === 0) return center;
    const t = Math.max(...found);
    return point(center.x + t * direction.x, center.y + t * direction.y);
}

/**
 * Where an edge end at `along` on `side` meets the silhouette, moving inward
 * from the bounding box perpendicular to the side (spec 10.5). Falls back to
 * the point on the bounding box when nothing is met, which only happens
 * outside the side's span.
 */
export function touch(
    geometry: ShapeGeometry,
    side: Side,
    along: number,
): Point {
    const { width, height } = geometry;
    const [origin, direction] = {
        top: [point(along, 0), point(0, 1)],
        right: [point(width, along), point(-1, 0)],
        bottom: [point(along, height), point(0, -1)],
        left: [point(0, along), point(1, 0)],
    }[side];
    const found = hits(geometry.segments, origin, direction);
    if (found.length === 0) return origin;
    const t = Math.min(...found);
    return point(origin.x + t * direction.x, origin.y + t * direction.y);
}

/* ---------------- spans */

/** A shape module: what to draw in a `width` × `height` box. */
export type ShapeBuilder = (
    width: number,
    height: number,
    strokeWidth: number,
) => ShapeDrawing;

/**
 * The box a shape is drawn in, from its style's `width` and `height`, for a
 * shape whose box upstream derives rather than takes from the style.
 */
export type SizeRule = (
    width: number,
    height: number,
) => { width: number; height: number };

/** A square box as wide as the style: Circle, Diamond, Person and Robot. */
export const squareFromWidth: SizeRule = (width) => ({ width, height: width });

/** The same inset from both ends of every side: the straight sides of a rounded rectangle. */
export const insetSpans = (
    width: number,
    height: number,
    inset: number,
): Record<Side, Span> => ({
    top: span(inset, width - inset),
    right: span(inset, height - inset),
    bottom: span(inset, width - inset),
    left: span(inset, height - inset),
});

/**
 * The stretch of an ellipse's side within 45° of parallel to it: centered on
 * the side, `1/√2` of the radius either way.
 */
export const ellipseSpan = (center: number, radius: number): Span =>
    span(center - radius * Math.SQRT1_2, center + radius * Math.SQRT1_2);
