// Fold the result files into one table per metric rule, a row per fixture and font.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OUT } from "./cases.mjs";

const pct = (x) => `${(x * 100).toFixed(2)}%`;
for (const rule of ["chrome", "file"]) {
    const files = readdirSync(OUT).filter(
        (f) => f.startsWith(`results-${rule}`) && f.endsWith(".json"),
    );
    const results = files.flatMap(
        (f) => JSON.parse(readFileSync(join(OUT, f), "utf8")).results,
    );
    const faces = Object.assign(
        {},
        ...files.map(
            (f) => JSON.parse(readFileSync(join(OUT, f), "utf8")).faces,
        ),
    );
    console.log(
        `\n### Metrics ${rule === "chrome" ? "copied from Chrome" : "read from the font file (hhea)"}\n`,
    );
    console.log(
        "| Fixture | Font | Exports | SVG identical | Lines that break apart | Largest text shift | Largest shape shift | PNG size equal | Pixels apart (max) | Bold kept | Same bytes twice | Median ms |",
    );
    console.log(
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    const groups = Map.groupBy(results, (r) => `${r.fixture}|${r.font}`);
    for (const [k, rs] of groups) {
        const [fixture, font] = k.split("|");
        const finite = rs.map((r) => r.svg.shapeDelta).filter(Number.isFinite);
        const shape = rs.some((r) => !Number.isFinite(r.svg.shapeDelta))
            ? "structure differs"
            : `${Math.max(0, ...finite).toFixed(2)} px`;
        const bolds = rs.filter((r) => r.png.unbolded !== null);
        const kept = bolds.filter(
            (r) => r.png.boldPixels < r.png.unbolded / 2,
        ).length;
        const ms = rs.map((r) => r.ms).sort((a, b) => a - b)[
            Math.floor(rs.length / 2)
        ];
        console.log(
            `| ${fixture} | ${font} | ${rs.length} | ${rs.filter((r) => r.svg.identical).length} | ${rs.reduce((n, r) => n + r.svg.lines.content, 0)} | ${Math.max(...rs.map((r) => Math.max(r.svg.lines.dx, r.svg.lines.dy))).toFixed(2)} px | ${shape} | ${rs.filter((r) => r.png.chrome === r.png.node).length}/${rs.length} | ${pct(Math.max(...rs.map((r) => r.png.pixels ?? 1)))} | ${bolds.length ? `${kept}/${bolds.length}` : "no bold"} | ${rs.filter((r) => r.deterministic.svg && r.deterministic.png).length}/${rs.length} | ${ms} |`,
        );
    }
    console.log("\nFont metrics (em):", JSON.stringify(faces));
    const chromeMetrics = [
        ...new Map(results.map((r) => [r.font, r.metrics])).entries(),
    ];
    console.log(
        "Chrome's fontBoundingBox (em):",
        JSON.stringify(Object.fromEntries(chromeMetrics)),
    );
    const broken = results.filter((r) => r.svg.lines.content).slice(0, 8);
    for (const r of broken)
        console.log(
            `- ${r.fixture}/${r.font}/${r.name}: ${JSON.stringify(r.svg.lines.examples)}`,
        );
}
