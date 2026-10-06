/**
 * Prototype (#98): dragging, selection and snapping in the React Flow
 * engine. Throwaway code on a throwaway branch; `?edit` in the page's URL
 * turns it on. Nothing here is saved anywhere.
 *
 *   pnpm dev -- test/__fixtures__/big-bank-plc-stored.json
 *   open http://localhost:5173/?edit#/?page=diagrams&view=Containers
 *   pnpm dev -- test/__fixtures__/large-landscape.json
 *   open http://localhost:5173/?edit#/?page=diagrams&view=LargeLandscapeStored
 *
 * Drag an element; click, Cmd/Ctrl/Shift-click and drag on empty canvas to
 * select; Space-drag or the middle button pans. Add `&visible` to the query
 * to render only what is on screen. The readout at the bottom left times
 * each drag frame. `node test/prototype-drag-bench.js` times the geometry
 * headless.
 */

import { ViewportPortal } from "@xyflow/react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { Bounds, Point } from "./graph";

export const EDITING =
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("edit");

/** Structurizr Local's nudge grid. */
export const GRID = 5;
/** How close, in screen pixels, an edge must come to snap to a guide. */
export const GUIDE_REACH = 8;

export type Guide = { from: Point; to: Point };

type Lines = { start: number; middle: number; end: number };
const linesX = (b: Bounds): Lines => ({
    start: b.x,
    middle: b.x + b.width / 2,
    end: b.x + b.width,
});
const linesY = (b: Bounds): Lines => ({
    start: b.y,
    middle: b.y + b.height / 2,
    end: b.y + b.height,
});

const around = (boxes: Bounds[]): Bounds => {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
};

/** The best guide on one axis: the shift to it and the box it aligns with. */
function nearest(
    moving: Lines,
    others: { box: Bounds; lines: Lines }[],
    reach: number,
) {
    let best: { shift: number; at: number; box: Bounds } | undefined;
    for (const other of others)
        for (const mine of Object.values(moving))
            for (const theirs of Object.values(other.lines)) {
                const shift = theirs - mine;
                if (Math.abs(shift) > reach) continue;
                if (best && Math.abs(best.shift) <= Math.abs(shift)) continue;
                best = { shift, at: theirs, box: other.box };
            }
    return best;
}

/**
 * Where the moving boxes go: each axis snaps to the nearest alignment guide
 * from another element within `reach`, else to the grid, by the box around
 * them all.
 */
export function snap(
    moving: Bounds[],
    others: Bounds[],
    reach: number,
): { dx: number; dy: number; guides: Guide[] } {
    const box = around(moving);
    const near = others.filter(
        (o) =>
            Math.abs(o.x + o.width / 2 - (box.x + box.width / 2)) < 1500 &&
            Math.abs(o.y + o.height / 2 - (box.y + box.height / 2)) < 1500,
    );
    const vertical = nearest(
        linesX(box),
        near.map((b) => ({ box: b, lines: linesX(b) })),
        reach,
    );
    const horizontal = nearest(
        linesY(box),
        near.map((b) => ({ box: b, lines: linesY(b) })),
        reach,
    );
    const dx = vertical
        ? vertical.shift
        : Math.round(box.x / GRID) * GRID - box.x;
    const dy = horizontal
        ? horizontal.shift
        : Math.round(box.y / GRID) * GRID - box.y;
    const moved = { ...box, x: box.x + dx, y: box.y + dy };
    const guides: Guide[] = [];
    if (vertical) {
        const top = Math.min(moved.y, vertical.box.y);
        const bottom = Math.max(
            moved.y + moved.height,
            vertical.box.y + vertical.box.height,
        );
        guides.push({
            from: { x: vertical.at, y: top },
            to: { x: vertical.at, y: bottom },
        });
    }
    if (horizontal) {
        const left = Math.min(moved.x, horizontal.box.x);
        const right = Math.max(
            moved.x + moved.width,
            horizontal.box.x + horizontal.box.width,
        );
        guides.push({
            from: { x: left, y: horizontal.at },
            to: { x: right, y: horizontal.at },
        });
    }
    return { dx, dy, guides };
}

export function Guides({ guides }: { guides: Guide[] }) {
    if (!guides.length) return null;
    return (
        <ViewportPortal>
            <svg
                style={{
                    position: "absolute",
                    overflow: "visible",
                    pointerEvents: "none",
                    zIndex: 1000,
                }}
                width={1}
                height={1}
            >
                <title>Alignment guides</title>
                {guides.map((g) => (
                    <line
                        key={`${g.from.x},${g.from.y},${g.to.x},${g.to.y}`}
                        x1={g.from.x}
                        y1={g.from.y}
                        x2={g.to.x}
                        y2={g.to.y}
                        stroke="#e5007a"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="4 3"
                    />
                ))}
            </svg>
        </ViewportPortal>
    );
}

/* ---------------- measurement */

export const stats = {
    /** Pointer event to the next frame after React commits, per drag frame. */
    frames: [] as number[],
    /** Pointer event to React's commit of the frame, per drag frame. */
    commits: [] as number[],
    /** `buildGraph` per drag frame. */
    geometry: [] as number[],
    /** `buildGraph` for the full route after a drop. */
    drops: [] as number[],
    pending: null as number | null,
    listeners: new Set<() => void>(),
    changed() {
        for (const l of this.listeners) l();
    },
};
if (EDITING)
    (window as unknown as { __editStats: typeof stats }).__editStats = stats;

const pct = (values: number[], q: number) => {
    if (!values.length) return "–";
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(q * (sorted.length - 1))].toFixed(1);
};

/** Record the time from the last drag event to the frame that shows it. */
export function useFrameLatency(graph: unknown) {
    // biome-ignore lint/correctness/useExhaustiveDependencies: each new graph is one frame to time
    useLayoutEffect(() => {
        if (stats.pending !== null)
            stats.commits.push(performance.now() - stats.pending);
    }, [graph]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: each new graph is one frame to time
    useEffect(() => {
        const start = stats.pending;
        if (start === null) return stats.changed();
        stats.pending = null;
        requestAnimationFrame(() => {
            stats.frames.push(performance.now() - start);
            stats.changed();
        });
    }, [graph]);
}

export function Readout({ selected }: { selected: number }) {
    const [, tick] = useState(0);
    useEffect(() => {
        const listener = () => tick((n) => n + 1);
        stats.listeners.add(listener);
        return () => {
            stats.listeners.delete(listener);
        };
    }, []);
    const last = stats.frames.slice(-120);
    const geometry = stats.geometry.slice(-120);
    const commits = stats.commits.slice(-120);
    return (
        <div
            style={{
                position: "absolute",
                left: 8,
                bottom: 8,
                zIndex: 10,
                font: "12px/1.4 ui-monospace, monospace",
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                padding: "6px 8px",
                borderRadius: 4,
                pointerEvents: "none",
                whiteSpace: "pre",
            }}
        >
            {`edit prototype · ${selected} selected
drag frame (event→paint) p50 ${pct(last, 0.5)} p95 ${pct(last, 0.95)} max ${pct(last, 1)} ms (n=${last.length})
event→commit              p50 ${pct(commits, 0.5)} p95 ${pct(commits, 0.95)} max ${pct(commits, 1)} ms
geometry per frame        p50 ${pct(geometry, 0.5)} p95 ${pct(geometry, 0.95)} ms
drop (full routing)       last ${stats.drops.at(-1)?.toFixed(0) ?? "–"} ms`}
        </div>
    );
}
