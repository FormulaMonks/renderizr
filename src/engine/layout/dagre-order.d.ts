// The pieces of Dagre's ordering step (`lib/order/`) that `automatic.ts`
// runs itself through `customOrder`. Dagre ships no types for them; these
// cover what the ordering step calls and nothing more.

declare module "@dagrejs/dagre/lib/order/init-order" {
    import type { graphlib } from "@dagrejs/dagre";
    export default function initOrder(g: graphlib.Graph): string[][];
}

declare module "@dagrejs/dagre/lib/order/cross-count" {
    import type { graphlib } from "@dagrejs/dagre";
    export default function crossCount(
        g: graphlib.Graph,
        layering: string[][],
    ): number;
}

declare module "@dagrejs/dagre/lib/order/sort-subgraph" {
    import type { graphlib } from "@dagrejs/dagre";
    export default function sortSubgraph(
        g: graphlib.Graph,
        v: string,
        cg: graphlib.Graph,
        biasRight: boolean,
    ): { vs: string[] };
}

declare module "@dagrejs/dagre/lib/order/build-layer-graph" {
    import type { graphlib } from "@dagrejs/dagre";
    export default function buildLayerGraph(
        g: graphlib.Graph,
        rank: number,
        relationship: "inEdges" | "outEdges",
        nodesWithRank: string[],
    ): graphlib.Graph;
}

declare module "@dagrejs/dagre/lib/order/add-subgraph-constraints" {
    import type { graphlib } from "@dagrejs/dagre";
    export default function addSubgraphConstraints(
        g: graphlib.Graph,
        cg: graphlib.Graph,
        vs: string[],
    ): void;
}

declare module "@dagrejs/dagre/lib/util" {
    import type { graphlib } from "@dagrejs/dagre";
    const util: {
        maxRank(g: graphlib.Graph): number;
        range(start: number, end?: number, step?: number): number[];
        buildLayerMatrix(g: graphlib.Graph): string[][];
    };
    export default util;
}
