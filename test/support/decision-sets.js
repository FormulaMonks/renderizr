/**
 * Seeded synthetic decision sets for the decision graph's layout tests, the
 * same sets the decision graph prototype (map #129, `prototype/131-decision-
 * graph.html`) measured its caps and fallbacks on.
 *
 * Each decision may supersede or amend a recent decision still in force and
 * reference a few older ones, a few decisions become hubs others reference
 * more often, and every link is stated from one side or both, in the
 * wordings real ADR tools write. The generator draws from Mulberry32 in the
 * prototype's exact order, title picks included, so a seed gives the
 * prototype's set decision for decision.
 */

import { random } from "./large-landscape.js";

const VERBS = [
    "Use",
    "Adopt",
    "Keep",
    "Drop",
    "Store",
    "Route",
    "Cache",
    "Split",
    "Version",
    "Sign",
    "Log",
    "Retry",
    "Queue",
    "Expose",
    "Encrypt",
    "Pin",
    "Mirror",
    "Throttle",
];
const NOUNS = [
    "events",
    "the gateway",
    "tenant data",
    "feature flags",
    "audit logs",
    "the read model",
    "webhooks",
    "secrets",
    "the CDN",
    "schema changes",
    "background jobs",
    "search indexes",
    "session tokens",
    "build artifacts",
    "the message bus",
    "rate limits",
    "config",
    "service accounts",
];
const HOW = [
    "in Postgres",
    "behind a flag",
    "per region",
    "with OpenTelemetry",
    "in one release",
    "through Kafka",
    "at the edge",
    "by hand",
    "with Terraform",
    "in S3",
    "on every deploy",
    "for thirty days",
    "",
];

/** Supersede wordings, as each side states them. */
const SUPERSEDES = [
    ["Supercedes", "Superceded by"],
    ["Supersedes", "Superseded by"],
    ["Overrides", "Overridden by"],
    ["supersedes", "superseded by"],
];
/** Reference wordings, as each side states them; most are unknown wordings. */
const REFERENCES = [
    ["References", "Referenced by"],
    ["Relates to", "Relates to"],
    ["Requires", "Required by"],
    ["Links to", "Links to"],
    ["Complements", "Complemented by"],
];

const DAY = 864e5;

/**
 * `count` decisions, nine days apart from 2019, with `referenceMean` the mean
 * number of references each decision makes.
 */
export function syntheticDecisions(count, referenceMean, seed) {
    const r = random(seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const start = Date.UTC(2019, 0, 1);
    const decisions = [];
    const hubs = [];

    for (let index = 1; index <= count; index++) {
        const date = new Date(
            start + index * 9 * DAY + Math.floor(r() * 5) * DAY,
        )
            .toISOString()
            .slice(0, 10);
        const decision = {
            id: String(index),
            title: `${pick(VERBS)} ${pick(NOUNS)} ${pick(HOW)}`.trim(),
            content: "",
            format: "Markdown",
            date,
            status: "Accepted",
            links: [],
        };
        const link = (target, [mine, theirs]) => {
            if (
                target === decision ||
                decision.links.some((known) => known.id === target.id)
            ) {
                return;
            }
            const side = r() < 0.5 ? "both" : r() < 0.5 ? "mine" : "theirs";
            if (side !== "theirs") {
                decision.links.push({ id: target.id, description: mine });
            }
            if (side !== "mine") {
                target.links.push({ id: decision.id, description: theirs });
            }
        };

        if (decisions.length > 3) {
            const roll = r();
            const live = decisions
                .slice(-50)
                .filter(
                    (known) =>
                        known.status === "Accepted" ||
                        known.status === "Amended",
                );
            if (live.length && roll < 0.09) {
                const target = pick(live);
                target.status = "Superseded";
                link(target, pick(SUPERSEDES));
            } else if (live.length && roll < 0.14) {
                const target = pick(live);
                if (target.status === "Accepted") target.status = "Amended";
                link(target, ["Amends", "Amended by"]);
            }

            let references = 0;
            let draw = r();
            while (draw > Math.exp(-referenceMean) && references < 8) {
                references++;
                draw *= r();
            }
            for (let reference = 0; reference < references; reference++) {
                const target =
                    hubs.length && r() < 0.35
                        ? pick(hubs)
                        : decisions[
                              Math.max(
                                  0,
                                  decisions.length -
                                      1 -
                                      Math.floor(r() * r() * decisions.length),
                              )
                          ];
                link(target, pick(REFERENCES));
            }
        }
        if (r() < 0.06) hubs.push(decision);
        decisions.push(decision);
    }

    for (const decision of decisions.slice(-4)) {
        decision.status = pick(["Proposed", "Proposed", "Accepted"]);
    }
    if (decisions.length > 20) {
        decisions[decisions.length - 12].status = "Rejected";
        decisions[decisions.length - 15].status = "Deprecated";
    }

    return decisions;
}
