/**
 * Room for the boundaries of an automatic layout (spec 7.1, 8). Dagre
 * places elements only and never learns how big the boundaries derived
 * around them will be: 50 padding and a label band at the bottom (ADR 9).
 * With separations below the 300 Structurizr defaults to, that is enough
 * for a boundary to cover a sibling boundary, or an element it is not
 * drawn around, as Big Bank's Live deployment does at 100.
 *
 * This pass runs after Dagre and makes the room Dagre did not: for a pair
 * that comes closer than the gap, it picks a line between the elements of
 * one and those of the other and moves everything wholly past that line,
 * elements and Dagre's vertices alike, by the shortfall. Moving everything
 * past a line keeps Dagre's ranks and order and never brings two things
 * closer, so each move settles one pair for good and the pass ends.
 */

import type { Bounds } from "./bounds";
import type { Point } from "./shapes/types";
import type { DeriveBoundaries } from "./unplaced";

/** An axis of the view: x runs left to right, y top to bottom. */
export type Axis = "x" | "y";

export type SpacingInput = {
    /** Every element's box, by id, where Dagre put it. */
    elements: ReadonlyMap<string, Bounds>;
    /**
     * The boundary each element or boundary is drawn directly inside, by
     * id; absent for one drawn inside none.
     */
    parent: ReadonlyMap<string, string>;
    /** Every boundary's box, derived around the elements as they are. */
    boundaries: DeriveBoundaries;
    /** Each edge's vertices, by edge key, in model units. */
    vertices: ReadonlyMap<string, readonly Point[]>;
    /**
     * The least room between a boundary and a sibling boundary, or an
     * element it is not drawn around.
     */
    gap: number;
    /** The axis the view ranks along, which wins a tie. */
    rankAxis: Axis;
};

export type Spaced = {
    /** Every element's box, by id, moved where it needed room. */
    elements: Map<string, Bounds>;
    /** Each edge's vertices, by edge key, moved with what they run past. */
    vertices: Map<string, Point[]>;
};

/** Two things that must keep the gap: a boundary and a boundary or element. */
type Pair = { boundary: string; other: string };

/** One move: everything starting at or past `line` on `axis` goes `by` further. */
type Move = { axis: Axis; line: number; by: number };

const SIZE = { x: "width", y: "height" } as const;

const start = (box: Bounds, axis: Axis) => box[axis];
const end = (box: Bounds, axis: Axis) => box[axis] + box[SIZE[axis]];

/** How far apart `a` and `b` are along `axis`; negative where they overlap. */
const distance = (a: Bounds, b: Bounds, axis: Axis) =>
    Math.max(start(b, axis) - end(a, axis), start(a, axis) - end(b, axis));

/** Whether `a` and `b` come closer than `gap` along both axes at once. */
const crowds = (a: Bounds, b: Bounds, gap: number) =>
    distance(a, b, "x") < gap && distance(a, b, "y") < gap;

/** The extent of `boxes` along `axis`. */
const extent = (boxes: readonly Bounds[], axis: Axis) => ({
    from: Math.min(...boxes.map((b) => start(b, axis))),
    to: Math.max(...boxes.map((b) => end(b, axis))),
});

/**
 * Space the elements of an automatic layout so that no boundary comes
 * closer than `gap` to a sibling boundary, or to an element it is not drawn
 * around. Where Dagre already left that much, nothing moves.
 *
 * For each pair that crowds, outermost first: on each axis along which the
 * elements of one lie wholly before those of the other, the line is where
 * the later ones start and the move is what the gap is short of. The
 * smaller move wins, the rank axis on a tie. A pair whose elements
 * interleave along both axes has no such line and is left as it is.
 */
export function spaceBoundaries(input: SpacingInput): Spaced {
    const elements = new Map(input.elements);
    const vertices = new Map(
        [...input.vertices].map(([key, points]) => [
            key,
            points.map((p) => ({ ...p })),
        ]),
    );

    const ancestors = (id: string) => {
        const around: string[] = [];
        for (let p = input.parent.get(id); p; p = input.parent.get(p))
            around.push(p);
        return around;
    };
    /** The elements drawn inside each boundary, at any depth. */
    const members = new Map<string, string[]>();
    for (const id of elements.keys())
        for (const boundary of ancestors(id))
            members.set(boundary, [...(members.get(boundary) ?? []), id]);
    const membersOf = (id: string) => members.get(id) ?? [id];
    const depth = (id: string) => ancestors(id).length;
    const related = (a: string, b: string) =>
        ancestors(a).includes(b) || ancestors(b).includes(a);

    /** Pairs no line separates, left as they are. */
    const stuck = new Set<string>();

    const crowding = (boxes: ReadonlyMap<string, Bounds>): Pair[] => {
        const ids = [...boxes.keys()].sort((a, b) => depth(a) - depth(b));
        const pairs: Pair[] = [];
        for (const [i, boundary] of ids.entries()) {
            const box = boxes.get(boundary)!;
            const others = [...ids.slice(i + 1), ...elements.keys()];
            for (const other of others) {
                if (related(boundary, other)) continue;
                if (stuck.has(`${boundary} ${other}`)) continue;
                const near = boxes.get(other) ?? elements.get(other)!;
                if (crowds(box, near, input.gap))
                    pairs.push({ boundary, other });
            }
        }
        return pairs;
    };

    const moveFor = (
        pair: Pair,
        boxes: ReadonlyMap<string, Bounds>,
    ): Move | undefined => {
        const a = boxes.get(pair.boundary)!;
        const b = boxes.get(pair.other) ?? elements.get(pair.other)!;
        const inA = membersOf(pair.boundary).map((id) => elements.get(id)!);
        const inB = membersOf(pair.other).map((id) => elements.get(id)!);
        const moves: Move[] = [];
        for (const axis of ["x", "y"] as const) {
            const ea = extent(inA, axis);
            const eb = extent(inB, axis);
            if (ea.to <= eb.from)
                moves.push({
                    axis,
                    line: eb.from,
                    by: input.gap - (start(b, axis) - end(a, axis)),
                });
            else if (eb.to <= ea.from)
                moves.push({
                    axis,
                    line: ea.from,
                    by: input.gap - (start(a, axis) - end(b, axis)),
                });
        }
        const rank = (m: Move) => (m.axis === input.rankAxis ? 0 : 1);
        return moves.sort((m, n) => m.by - n.by || rank(m) - rank(n))[0];
    };

    const apply = ({ axis, line, by }: Move) => {
        for (const [id, box] of elements)
            if (start(box, axis) >= line)
                elements.set(id, { ...box, [axis]: box[axis] + by });
        for (const points of vertices.values())
            for (const point of points)
                if (point[axis] >= line) point[axis] += by;
    };

    // Each move settles its pair and brings no two things closer, so there
    // are never more moves than pairs; the bound only guards against a bug.
    for (let moves = 0; ; moves++) {
        const boxes = input.boundaries(elements);
        const [pair] = crowding(boxes);
        if (!pair) break;
        const move = moveFor(pair, boxes);
        if (!move || moves > elements.size * boxes.size) {
            stuck.add(`${pair.boundary} ${pair.other}`);
            continue;
        }
        apply(move);
    }
    return { elements, vertices };
}
