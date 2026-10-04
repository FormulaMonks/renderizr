/**
 * Where each unplaced element of a stored layout goes (spec 7.2, ADR 10).
 * The rest of the view keeps its coordinates; an element the workspace left
 * at (0,0) is put next to the elements it relates to, in the first slot that
 * keeps clear of everything else, instead of being piled in the top-left
 * corner the way Structurizr's renderer does.
 */

import { type Bounds, boundsOf, type Size } from "./bounds";

/** The clearance a slot keeps from placed elements and foreign boundaries. */
export const UNPLACED_GAP = 60;

/**
 * The room a relationship's label keeps on either side, between it and each
 * element it sits between, when a slot is spaced for it.
 */
export const LABEL_CLEARANCE = 20;

/** How many separations out from a neighbor slots are tried. */
const STEPS = [1, 2, 3];

export type UnplacedElement = {
    id: string;
    width: number;
    height: number;
    /** The boundaries around it, innermost first. */
    ancestors: string[];
};

/** Where an unplaced element was put: its new top-left. */
export type Placement = { id: string; x: number; y: number };

/**
 * Every boundary's box by id, derived around the elements placed so far, so
 * that a boundary grows as its children are placed.
 */
export type DeriveBoundaries = (
    placed: ReadonlyMap<string, Bounds>,
) => ReadonlyMap<string, Bounds>;

export type UnplacedInput = {
    /** Elements already where they will be drawn, by id. */
    placed: ReadonlyMap<string, Bounds>;
    /** The elements to place, in view order. */
    unplaced: UnplacedElement[];
    /**
     * Source and target of each relationship in the view, and the size of
     * its label when it says something.
     */
    relationships: ReadonlyArray<readonly [string, string, Size?]>;
    /** How far from a neighbor a slot starts, and how far apart slots step. */
    separation: number;
    /** Every boundary's box, derived around what has been placed so far. */
    boundaries: DeriveBoundaries;
};

const centerOf = (box: Bounds) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
});

/** The mean of the centers of `boxes`, or undefined when there are none. */
function centroidOf(boxes: Bounds[]): { x: number; y: number } | undefined {
    if (!boxes.length) return undefined;
    const centers = boxes.map(centerOf);
    return {
        x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
        y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
    };
}

/** A gap along each axis. */
type Gap = { x: number; y: number };

/** Whether `a` and `b` come closer than `gap` on both axes at once. */
const crowds = (a: Bounds, b: Bounds, gap: Gap) =>
    a.x < b.x + b.width + gap.x &&
    b.x < a.x + a.width + gap.x &&
    a.y < b.y + b.height + gap.y &&
    b.y < a.y + a.height + gap.y;

const contains = (outer: Bounds, inner: Bounds) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

/**
 * The slots around `neighbor` for a `width` × `height` element: one `gap`
 * past its edge and then a step further, below, right, left and above,
 * centered on it across the other axis.
 */
function slotsAround(
    neighbor: Bounds,
    width: number,
    height: number,
    gap: Gap,
): Bounds[] {
    const middle = centerOf(neighbor);
    const slots: Bounds[] = [];
    for (const step of STEPS) {
        const across = (step - 1) * (width + gap.x);
        const down = (step - 1) * (height + gap.y);
        const x = middle.x - width / 2;
        const y = middle.y - height / 2;
        slots.push(
            {
                x,
                y: neighbor.y + neighbor.height + gap.y + down,
                width,
                height,
            },
            {
                x: neighbor.x + neighbor.width + gap.x + across,
                y,
                width,
                height,
            },
            { x: neighbor.x - gap.x - width - across, y, width, height },
            { x, y: neighbor.y - gap.y - height - down, width, height },
        );
    }
    return slots;
}

/**
 * The placed elements `element` relates to, each once, and the gap a slot
 * keeps from each: one `separation`, widened along x to fit the widest label
 * of any relationship between them beside it and along y to fit the tallest
 * above or below it, with `LABEL_CLEARANCE` on either side. Without it, a
 * label drawn between two elements a separation apart covers one of them
 * whenever it is wider or taller than the gap. Listing a neighbor once per
 * relationship weighted the centroid by relationship count, so two parallel
 * relationships pulled the element toward that neighbor.
 */
function neighborsOf(
    element: string,
    input: UnplacedInput,
    placed: ReadonlyMap<string, Bounds>,
): { neighbors: Bounds[]; gaps: Map<Bounds, Gap> } {
    const neighbors: Bounds[] = [];
    const gaps = new Map<Bounds, Gap>();
    for (const [source, target, label] of input.relationships) {
        const other =
            source === element
                ? target
                : target === element
                  ? source
                  : undefined;
        // The element itself is not placed yet, so a relationship to itself
        // finds no box here.
        const box = other === undefined ? undefined : placed.get(other);
        if (!box) continue;
        if (!gaps.has(box)) neighbors.push(box);
        const gap = gaps.get(box) ?? {
            x: input.separation,
            y: input.separation,
        };
        if (label) {
            gap.x = Math.max(gap.x, label.width + 2 * LABEL_CLEARANCE);
            gap.y = Math.max(gap.y, label.height + 2 * LABEL_CLEARANCE);
        }
        gaps.set(box, gap);
    }
    return { neighbors, gaps };
}

/** The clearance every placement keeps, along both axes. */
const CLEAR: Gap = { x: UNPLACED_GAP, y: UNPLACED_GAP };

/**
 * Whether putting `element` at `slot` keeps each boundary around it clear of
 * `obstacles`: the placed elements and the boundaries it is not inside. Each
 * boundary is derived again with the element in it, since a slot clear of
 * everything can still stretch the element's boundary back across a
 * non-member on the way to its other members. An overlap the stored layout
 * already had is the author's, so only what the slot adds counts.
 */
function keepsBoundariesClear(
    element: UnplacedElement,
    slot: Bounds,
    placed: ReadonlyMap<string, Bounds>,
    before: ReadonlyMap<string, Bounds>,
    obstacles: Bounds[],
    derive: DeriveBoundaries,
): boolean {
    if (!element.ancestors.length) return true;
    const after = derive(new Map(placed).set(element.id, slot));
    return element.ancestors.every((id) => {
        const grown = after.get(id);
        if (!grown) return true;
        const was = before.get(id);
        return obstacles.every(
            (o) =>
                !crowds(grown, o, CLEAR) ||
                (was !== undefined && crowds(was, o, CLEAR)),
        );
    });
}

/**
 * Where an element with no free slot goes: right of `view`, at least
 * `UNPLACED_GAP` past it, stepping a further `UNPLACED_GAP` right while the
 * spot does not `fit`. A separation under the gap put it closer than any
 * slot may come. Once it is `reach` past the first spot it is clear of
 * every placed element and label gap; what blocks it then is a boundary of
 * its own stretching back to its other members, which no step right can
 * clear, so the first spot stands.
 */
function fallback(
    element: UnplacedElement,
    view: Bounds | undefined,
    y: number,
    separation: number,
    reach: number,
    fits: (spot: Bounds) => boolean,
): Bounds {
    const spot = (x: number) => ({
        x,
        y,
        width: element.width,
        height: element.height,
    });
    if (!view) return spot(0);
    const first = view.x + view.width + Math.max(separation, UNPLACED_GAP);
    for (let x = first; x <= first + reach; x += UNPLACED_GAP)
        if (fits(spot(x))) return spot(x);
    return spot(first);
}

/**
 * Place each unplaced element in view order: try the slots around every
 * related element already placed, nearest the centroid of those neighbors
 * first, preferring slots inside the element's own boundary, and take the
 * first that keeps `UNPLACED_GAP` from every placed element and from every
 * boundary it is not inside, and its label gap from every related element,
 * without growing a boundary around it within `UNPLACED_GAP` of anything
 * outside it. Without one, it goes to the right of the view. Each placement
 * counts as placed for the next. Placed elements never move.
 */
export function placeUnplaced(input: UnplacedInput): Placement[] {
    const placed = new Map(input.placed);
    const placements: Placement[] = [];
    for (const element of input.unplaced) {
        const boundaries = input.boundaries(placed);
        const { neighbors, gaps } = neighborsOf(element.id, input, placed);
        const centroid = centroidOf(neighbors);
        const distance = (slot: Bounds) => {
            const c = centerOf(slot);
            return centroid
                ? Math.hypot(c.x - centroid.x, c.y - centroid.y)
                : 0;
        };
        const slots = neighbors
            .flatMap((n) =>
                slotsAround(n, element.width, element.height, gaps.get(n)!),
            )
            .sort((a, b) => distance(a) - distance(b));

        const own = boundaries.get(element.ancestors[0] ?? "");
        const inside = own ? slots.filter((s) => contains(own, s)) : [];
        const outside = own ? slots.filter((s) => !contains(own, s)) : slots;
        const ancestors = new Set(element.ancestors);
        const obstacles = [
            ...placed.values(),
            ...[...boundaries]
                .filter(([id]) => !ancestors.has(id))
                .map(([, box]) => box),
        ];
        const fits = (slot: Bounds) =>
            obstacles.every((o) => {
                const gap = gaps.get(o);
                return !crowds(
                    slot,
                    o,
                    gap
                        ? {
                              x: Math.max(CLEAR.x, gap.x),
                              y: Math.max(CLEAR.y, gap.y),
                          }
                        : CLEAR,
                );
            }) &&
            keepsBoundariesClear(
                element,
                slot,
                placed,
                boundaries,
                obstacles,
                input.boundaries,
            );
        const reach =
            element.width +
            Math.max(CLEAR.x, ...[...gaps.values()].map((g) => g.x));
        const view = boundsOf([...placed.values(), ...boundaries.values()]);
        const at =
            [...inside, ...outside].find(fits) ??
            fallback(
                element,
                view,
                centroid ? centroid.y - element.height / 2 : view?.y ?? 0,
                input.separation,
                reach,
                fits,
            );
        placements.push({ id: element.id, x: at.x, y: at.y });
        placed.set(element.id, {
            x: at.x,
            y: at.y,
            width: element.width,
            height: element.height,
        });
    }
    return placements;
}
