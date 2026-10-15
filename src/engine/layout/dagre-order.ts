/*
 * Portions derived from Dagre 2.0.4 (https://github.com/dagrejs/dagre), files
 * lib/order/init-order.js, lib/order/cross-count.js,
 * lib/order/sort-subgraph.js, lib/order/barycenter.js,
 * lib/order/resolve-conflicts.js, lib/order/sort.js,
 * lib/order/build-layer-graph.js, lib/order/add-subgraph-constraints.js and
 * lib/util.js (maxRank, range, buildLayerMatrix).
 *
 * Copyright (c) 2012-2014 Chris Pettitt
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 * Modified by Renderizr: ported to typed TypeScript, step for step, so that
 * `automatic.ts` can run Dagre's ordering step itself through `customOrder`.
 * Dagre 2.x ships one bundled build and exports none of these pieces.
 */

import dagre from "@dagrejs/dagre";

export type Graph = dagre.graphlib.Graph;

/** What Dagre keeps on each node while it orders them. */
type Ranked = {
    rank?: number;
    minRank?: number;
    maxRank?: number;
    order: number;
    borderLeft?: string[] | string;
    borderRight?: string[] | string;
};
const label = (g: Graph, v: string) => g.node(v) as Ranked;
const weightOf = (g: Graph, e: dagre.Edge) =>
    (g.edge(e) as { weight: number }).weight;

/** The highest rank of any node of `g`. */
export function maxRank(g: Graph): number {
    return Math.max(
        ...g.nodes().map((v) => label(g, v).rank ?? Number.MIN_VALUE),
    );
}

/** The numbers from `start` up to `limit`, or down to it by a negative step. */
export function range(start: number, limit?: number, step = 1): number[] {
    let from = start;
    let to = limit;
    if (to === undefined) {
        to = from;
        from = 0;
    }
    const result: number[] = [];
    for (let i = from; step < 0 ? to < i : i < to; i += step) result.push(i);
    return result;
}

/** Every rank's nodes, each at its order. */
export function buildLayerMatrix(g: Graph): string[][] {
    const layering = range(maxRank(g) + 1).map((): string[] => []);
    for (const v of g.nodes()) {
        const { rank, order } = label(g, v);
        if (rank !== undefined) layering[rank][order] = v;
    }
    return layering;
}

/**
 * A first order for every rank: a depth-first walk from the nodes of the
 * first rank, each node placed as it is first reached (Gansner et al., "A
 * Technique for Drawing Directed Graphs").
 */
export function initOrder(g: Graph): string[][] {
    const visited = new Set<string>();
    const simpleNodes = g.nodes().filter((v) => !g.children(v).length);
    const ranks = simpleNodes.map((v) => label(g, v).rank as number);
    const layers = range(Math.max(...ranks) + 1).map((): string[] => []);

    const dfs = (v: string) => {
        if (visited.has(v)) return;
        visited.add(v);
        layers[label(g, v).rank as number].push(v);
        for (const w of g.successors(v) ?? []) dfs(w);
    };
    simpleNodes
        .sort((a, b) => (label(g, a).rank ?? 0) - (label(g, b).rank ?? 0))
        .forEach(dfs);
    return layers;
}

/**
 * The weighted number of crossings between each pair of neighboring ranks
 * (Barth et al., "Bilayer Cross Counting").
 */
export function crossCount(g: Graph, layering: string[][]): number {
    let count = 0;
    for (let i = 1; i < layering.length; ++i)
        count += twoLayerCrossCount(g, layering[i - 1], layering[i]);
    return count;
}

function twoLayerCrossCount(
    g: Graph,
    northLayer: string[],
    southLayer: string[],
): number {
    const southPos = new Map(southLayer.map((v, i) => [v, i]));
    const southEntries = northLayer.flatMap((v) =>
        (g.outEdges(v) ?? [])
            .map((e) => ({
                pos: southPos.get(e.w) as number,
                weight: weightOf(g, e),
            }))
            .sort((a, b) => a.pos - b.pos),
    );

    let firstIndex = 1;
    while (firstIndex < southLayer.length) firstIndex <<= 1;
    const tree = new Array<number>(2 * firstIndex - 1).fill(0);
    firstIndex -= 1;

    let count = 0;
    for (const entry of southEntries) {
        let index = entry.pos + firstIndex;
        tree[index] += entry.weight;
        let weightSum = 0;
        while (index > 0) {
            if (index % 2) weightSum += tree[index + 1];
            index = (index - 1) >> 1;
            tree[index] += entry.weight;
        }
        count += entry.weight * weightSum;
    }
    return count;
}

type Barycenter = { v: string; barycenter?: number; weight?: number };
type Entry = { vs: string[]; i: number; barycenter?: number; weight?: number };
type Sorted = { vs: string[]; barycenter?: number; weight?: number };

/** Order the children of `v` in layer graph `g`, its subgraphs first. */
export function sortSubgraph(
    g: Graph,
    v: string,
    cg: Graph,
    biasRight: boolean,
): Sorted {
    let movable = g.children(v);
    const node = g.node(v) as Ranked | undefined;
    const bl = node?.borderLeft as string | undefined;
    const br = node?.borderRight as string | undefined;
    const subgraphs = new Map<string, Sorted>();

    if (bl) movable = movable.filter((w) => w !== bl && w !== br);

    const barycenters = barycenter(g, movable);
    for (const entry of barycenters)
        if (g.children(entry.v).length) {
            const result = sortSubgraph(g, entry.v, cg, biasRight);
            subgraphs.set(entry.v, result);
            if (Object.hasOwn(result, "barycenter"))
                mergeBarycenters(entry, result);
        }

    const entries = resolveConflicts(barycenters, cg);
    for (const entry of entries)
        entry.vs = entry.vs.flatMap((w) => subgraphs.get(w)?.vs ?? w);

    const result = sort(entries, biasRight);

    if (bl && br) {
        result.vs = [bl, ...result.vs, br];
        const blPreds = g.predecessors(bl) ?? [];
        if (blPreds.length) {
            const blPred = label(g, blPreds[0]);
            const brPred = label(g, (g.predecessors(br) ?? [])[0]);
            if (!Object.hasOwn(result, "barycenter")) {
                result.barycenter = 0;
                result.weight = 0;
            }
            const weight = result.weight as number;
            result.barycenter =
                ((result.barycenter as number) * weight +
                    blPred.order +
                    brPred.order) /
                (weight + 2);
            result.weight = weight + 2;
        }
    }
    return result;
}

function mergeBarycenters(target: Barycenter, other: Sorted): void {
    if (target.barycenter !== undefined) {
        const weight = target.weight as number;
        const otherWeight = other.weight as number;
        target.barycenter =
            (target.barycenter * weight +
                (other.barycenter as number) * otherWeight) /
            (weight + otherWeight);
        target.weight = weight + otherWeight;
    } else {
        target.barycenter = other.barycenter;
        target.weight = other.weight;
    }
}

function barycenter(g: Graph, movable: string[]): Barycenter[] {
    return movable.map((v) => {
        const inV = g.inEdges(v) ?? [];
        if (!inV.length) return { v };
        let sum = 0;
        let weight = 0;
        for (const e of inV) {
            const w = weightOf(g, e);
            sum += w * label(g, e.v).order;
            weight += w;
        }
        return { v, barycenter: sum / weight, weight };
    });
}

type Conflict = Entry & {
    indegree: number;
    in: Conflict[];
    out: Conflict[];
    merged?: boolean;
};

/**
 * Coalesce the entries whose barycenters break a constraint of `cg` into one
 * that keeps it (Forster, "A Fast and Simple Heuristic for Constrained
 * Two-Level Crossing Reduction").
 */
function resolveConflicts(entries: Barycenter[], cg: Graph): Entry[] {
    const mapped = new Map<string, Conflict>();
    entries.forEach((entry, i) => {
        const conflict: Conflict = {
            indegree: 0,
            in: [],
            out: [],
            vs: [entry.v],
            i,
        };
        if (entry.barycenter !== undefined) {
            conflict.barycenter = entry.barycenter;
            conflict.weight = entry.weight;
        }
        mapped.set(entry.v, conflict);
    });

    for (const e of cg.edges()) {
        const entryV = mapped.get(e.v);
        const entryW = mapped.get(e.w);
        if (entryV !== undefined && entryW !== undefined) {
            entryW.indegree++;
            entryV.out.push(entryW);
        }
    }

    const sourceSet = [...mapped.values()].filter((entry) => !entry.indegree);
    const result: Conflict[] = [];
    while (sourceSet.length) {
        const entry = sourceSet.pop() as Conflict;
        result.push(entry);
        for (const uEntry of entry.in.reverse()) {
            if (uEntry.merged) continue;
            if (
                uEntry.barycenter === undefined ||
                entry.barycenter === undefined ||
                uEntry.barycenter >= entry.barycenter
            )
                mergeEntries(entry, uEntry);
        }
        for (const wEntry of entry.out) {
            wEntry.in.push(entry);
            if (--wEntry.indegree === 0) sourceSet.push(wEntry);
        }
    }

    return result
        .filter((entry) => !entry.merged)
        .map(({ vs, i, barycenter, weight }) => ({
            vs,
            i,
            ...(barycenter !== undefined && { barycenter }),
            ...(weight !== undefined && { weight }),
        }));
}

function mergeEntries(target: Conflict, source: Conflict): void {
    let sum = 0;
    let weight = 0;
    if (target.weight) {
        sum += (target.barycenter as number) * target.weight;
        weight += target.weight;
    }
    if (source.weight) {
        sum += (source.barycenter as number) * source.weight;
        weight += source.weight;
    }
    target.vs = source.vs.concat(target.vs);
    target.barycenter = sum / weight;
    target.weight = weight;
    target.i = Math.min(source.i, target.i);
    source.merged = true;
}

function sort(entries: Entry[], biasRight: boolean): Sorted {
    const sortable = entries.filter((entry) =>
        Object.hasOwn(entry, "barycenter"),
    );
    const unsortable = entries
        .filter((entry) => !Object.hasOwn(entry, "barycenter"))
        .sort((a, b) => b.i - a.i);
    const vs: string[][] = [];
    let sum = 0;
    let weight = 0;

    sortable.sort((a, b) => {
        const v = a.barycenter as number;
        const w = b.barycenter as number;
        if (v < w) return -1;
        if (v > w) return 1;
        return biasRight ? b.i - a.i : a.i - b.i;
    });

    let vsIndex = consumeUnsortable(vs, unsortable, 0);
    for (const entry of sortable) {
        vsIndex += entry.vs.length;
        vs.push(entry.vs);
        sum += (entry.barycenter as number) * (entry.weight as number);
        weight += entry.weight as number;
        vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
    }

    const result: Sorted = { vs: vs.flat() };
    if (weight) {
        result.barycenter = sum / weight;
        result.weight = weight;
    }
    return result;
}

function consumeUnsortable(
    vs: string[][],
    unsortable: Entry[],
    index: number,
): number {
    let next = index;
    while (unsortable.length && unsortable[unsortable.length - 1].i <= next) {
        vs.push((unsortable.pop() as Entry).vs);
        next++;
    }
    return next;
}

let rootCount = 0;

/**
 * The graph that orders rank `rank`: its nodes in their hierarchy under a
 * root, the nodes the chosen `relationship` reaches, and the edges between,
 * their weights summed. Each node shares its label with `g`.
 */
export function buildLayerGraph(
    g: Graph,
    rank: number,
    relationship: "inEdges" | "outEdges",
    nodesWithRank: string[],
): Graph {
    let root: string;
    do root = `_root${++rootCount}`;
    while (g.hasNode(root));
    const result = new dagre.graphlib.Graph({ compound: true })
        .setGraph({ root } as dagre.GraphLabel)
        .setDefaultNodeLabel((v: string) => g.node(v));

    for (const v of nodesWithRank) {
        const node = label(g, v);
        const parent = g.parent(v);
        if (
            node.rank === rank ||
            ((node.minRank as number) <= rank &&
                rank <= (node.maxRank as number))
        ) {
            result.setNode(v);
            result.setParent(v, parent || root);

            for (const e of g[relationship](v) ?? []) {
                const u = e.v === v ? e.w : e.v;
                const edge = result.edge(u, v) as
                    | { weight: number }
                    | undefined;
                result.setEdge(u, v, {
                    weight: weightOf(g, e) + (edge?.weight ?? 0),
                });
            }

            if (Object.hasOwn(node, "minRank"))
                result.setNode(v, {
                    borderLeft: (node.borderLeft as string[])[rank],
                    borderRight: (node.borderRight as string[])[rank],
                });
        }
    }
    return result;
}

/**
 * Constrain the next rank to keep each pair of sibling boundaries that `vs`
 * puts side by side in the same order.
 */
export function addSubgraphConstraints(
    g: Graph,
    cg: Graph,
    vs: string[],
): void {
    const prev = new Map<string, string>();
    let rootPrev: string | undefined;
    for (const v of vs) {
        let child = g.parent(v) || undefined;
        while (child) {
            const parent = g.parent(child) || undefined;
            let prevChild: string | undefined;
            if (parent) {
                prevChild = prev.get(parent);
                prev.set(parent, child);
            } else {
                prevChild = rootPrev;
                rootPrev = child;
            }
            if (prevChild && prevChild !== child) {
                cg.setEdge(prevChild, child);
                break;
            }
            child = parent;
        }
    }
}
