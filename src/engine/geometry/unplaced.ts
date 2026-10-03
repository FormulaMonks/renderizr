/**
 * Where each unplaced element of a stored layout goes (spec 7.2, ADR 10).
 * The rest of the view keeps its coordinates; an element the workspace left
 * at (0,0) is put next to the elements it relates to, in the first slot that
 * keeps clear of everything else, instead of being piled in the top-left
 * corner the way Structurizr's renderer does.
 */

import { type Bounds, boundsOf } from "./bounds";

/** The clearance a slot keeps from placed elements and foreign boundaries. */
export const UNPLACED_GAP = 60;

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
    /** Source and target of each relationship in the view. */
    relationships: ReadonlyArray<readonly [string, string]>;
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

/** Whether `a` and `b` come closer than `gap` on both axes at once. */
const crowds = (a: Bounds, b: Bounds, gap: number) =>
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap;

const contains = (outer: Bounds, inner: Bounds) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

/**
 * The slots around `neighbor` for a `width` × `height` element: one
 * separation past its edge and then a step further, below, right, left and
 * above, centered on it across the other axis.
 */
function slotsAround(
    neighbor: Bounds,
    width: number,
    height: number,
    separation: number,
): Bounds[] {
    const middle = centerOf(neighbor);
    const slots: Bounds[] = [];
    for (const step of STEPS) {
        const across = (step - 1) * (width + separation);
        const down = (step - 1) * (height + separation);
        const x = middle.x - width / 2;
        const y = middle.y - height / 2;
        slots.push(
            {
                x,
                y: neighbor.y + neighbor.height + separation + down,
                width,
                height,
            },
            {
                x: neighbor.x + neighbor.width + separation + across,
                y,
                width,
                height,
            },
            { x: neighbor.x - separation - width - across, y, width, height },
            { x, y: neighbor.y - separation - height - down, width, height },
        );
    }
    return slots;
}

/**
 * Place each unplaced element in view order: try the slots around every
 * related element already placed, nearest the centroid of those neighbors
 * first, preferring slots inside the element's own boundary, and take the
 * first that keeps `UNPLACED_GAP` from every placed element and from every
 * boundary it is not inside. Without one, it goes to the right of the view.
 * Each placement counts as placed for the next.
 */
export function placeUnplaced(input: UnplacedInput): Placement[] {
    const placed = new Map(input.placed);
    const placements: Placement[] = [];
    for (const element of input.unplaced) {
        const boundaries = input.boundaries(placed);
        const neighbors: Bounds[] = [];
        for (const [source, target] of input.relationships) {
            const other =
                source === element.id
                    ? target
                    : target === element.id
                      ? source
                      : undefined;
            // The element itself is not placed yet, so a relationship to
            // itself finds no box here.
            const box = other === undefined ? undefined : placed.get(other);
            if (box) neighbors.push(box);
        }
        const centroid = centroidOf(neighbors);
        const distance = (slot: Bounds) => {
            const c = centerOf(slot);
            return centroid
                ? Math.hypot(c.x - centroid.x, c.y - centroid.y)
                : 0;
        };
        const slots = neighbors
            .flatMap((n) =>
                slotsAround(n, element.width, element.height, input.separation),
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
        const free = [...inside, ...outside].find((slot) =>
            obstacles.every((o) => !crowds(slot, o, UNPLACED_GAP)),
        );

        const view = boundsOf([...placed.values(), ...boundaries.values()]);
        const at = free ?? {
            x: view ? view.x + view.width + input.separation : 0,
            y: centroid ? centroid.y - element.height / 2 : view?.y ?? 0,
        };
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
