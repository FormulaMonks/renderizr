// Quality checks shared by the benchmark: containment, sibling overlap, edge crossings, SVG preview.

const EPS = 0.5;

function inside(child, parent) {
    return (
        child.x >= parent.x - EPS &&
        child.y >= parent.y - EPS &&
        child.x + child.width <= parent.x + parent.width + EPS &&
        child.y + child.height <= parent.y + parent.height + EPS
    );
}

function overlap(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > EPS && h > EPS ? w * h : 0;
}

/** Children not inside their parent box. */
export function containmentViolations(boxes) {
    const out = [];
    for (const b of boxes.values()) {
        if (!b.parent) continue;
        const p = boxes.get(b.parent);
        if (p && !inside(b, p)) out.push(`${b.label} escapes ${p.label}`);
    }
    return out;
}

/** Pairs of boxes with the same parent whose rectangles intersect. */
export function siblingOverlaps(boxes) {
    const list = [...boxes.values()];
    const out = [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if ((a.parent ?? null) !== (b.parent ?? null)) continue;
            const area = overlap(a, b);
            if (area > 0)
                out.push(`${a.label} x ${b.label} (${Math.round(area)}px²)`);
        }
    }
    return out;
}

/** Leaf boxes overlapped by any boundary they are not inside (a boundary drawn across unrelated elements). */
export function foreignBoundaryOverlaps(boxes) {
    const out = [];
    const isAncestor = (box, boundaryId) => {
        let cur = box;
        while (cur?.parent) {
            if (cur.parent === boundaryId) return true;
            cur = boxes.get(cur.parent);
        }
        return false;
    };
    for (const b of boxes.values()) {
        if (b.kind !== "element") continue;
        for (const p of boxes.values()) {
            if (p.kind === "element" || isAncestor(b, p.id)) continue;
            if (overlap(b, p) > 0) out.push(`${b.label} under ${p.label}`);
        }
    }
    return out;
}

function segmentsCross(p1, p2, p3, p4) {
    const d = (a, b, c) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = d(p3, p4, p1);
    const d2 = d(p3, p4, p2);
    const d3 = d(p1, p2, p3);
    const d4 = d(p1, p2, p4);
    return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
}

/** Number of crossing pairs among the routed polylines (or the straight centre-to-centre line when there are no points). */
export function edgeCrossings(edges, boxes) {
    const polylines = edges.map((e) => {
        if (e.points?.length >= 2) return e.points;
        const s = boxes.get(e.source);
        const t = boxes.get(e.target);
        return [
            { x: s.x + s.width / 2, y: s.y + s.height / 2 },
            { x: t.x + t.width / 2, y: t.y + t.height / 2 },
        ];
    });
    let count = 0;
    for (let i = 0; i < polylines.length; i++) {
        for (let j = i + 1; j < polylines.length; j++) {
            if (
                edges[i].source === edges[j].source ||
                edges[i].target === edges[j].target ||
                edges[i].source === edges[j].target ||
                edges[i].target === edges[j].source
            )
                continue;
            let crossed = false;
            for (let a = 0; a < polylines[i].length - 1 && !crossed; a++) {
                for (let b = 0; b < polylines[j].length - 1 && !crossed; b++) {
                    if (
                        segmentsCross(
                            polylines[i][a],
                            polylines[i][a + 1],
                            polylines[j][b],
                            polylines[j][b + 1],
                        )
                    )
                        crossed = true;
                }
            }
            if (crossed) count++;
        }
    }
    return count;
}

export function bounds(boxes) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const b of boxes.values()) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function toSvg(result, title) {
    const bb = bounds(result.boxes);
    const pad = 40;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const depth = (b) => {
        let d = 0;
        let cur = b;
        while (cur?.parent) {
            d++;
            cur = result.boxes.get(cur.parent);
        }
        return d;
    };
    const sorted = [...result.boxes.values()].sort(
        (a, b) => depth(a) - depth(b),
    );
    const parts = [];
    for (const b of sorted) {
        const boundary = b.kind !== "element";
        parts.push(
            `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${boundary ? "none" : "#dbe7ff"}" stroke="${boundary ? "#888" : "#1f4e9c"}" stroke-width="2"${boundary ? ' stroke-dasharray="12 8"' : ""}/>`,
        );
        parts.push(
            `<text x="${b.x + 12}" y="${b.y + (boundary ? 28 : b.height / 2)}" font-family="sans-serif" font-size="${boundary ? 26 : 22}" fill="${boundary ? "#555" : "#111"}">${esc(b.label)}</text>`,
        );
    }
    for (const e of result.edges) {
        let pts = e.points;
        if (!pts || pts.length < 2) {
            const s = result.boxes.get(e.source);
            const t = result.boxes.get(e.target);
            pts = [
                { x: s.x + s.width / 2, y: s.y + s.height / 2 },
                { x: t.x + t.width / 2, y: t.y + t.height / 2 },
            ];
        }
        parts.push(
            `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#c0392b" stroke-width="3"/>`,
        );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}" width="${Math.round((bb.width + 2 * pad) / 2)}" height="${Math.round((bb.height + 2 * pad) / 2)}"><title>${esc(title)}</title><rect x="${bb.x - pad}" y="${bb.y - pad}" width="${bb.width + 2 * pad}" height="${bb.height + 2 * pad}" fill="#fff"/>${parts.join("")}</svg>`;
}
