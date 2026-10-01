// Lists the views of a Structurizr workspace JSON with element/relationship counts and automaticLayout settings.
// Usage: node docs/research/compound-layout/list-views.js <workspace.json>
import { readFileSync } from "node:fs";

const w = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const k of Object.keys(w.views)) {
    if (!Array.isArray(w.views[k])) continue;
    for (const v of w.views[k]) {
        console.log(
            k,
            v.key,
            "elements:",
            (v.elements || []).length,
            "rels:",
            (v.relationships || []).length,
            "autoLayout:",
            JSON.stringify(v.automaticLayout || null),
            v.environment || "",
            v.softwareSystemId || "",
        );
    }
}
