/**
 * The large fixture of spec 15.3, item 4: a system landscape with 300
 * elements, 600 relationships and 20 groups, drawn by two views, one laid out
 * automatically and one with a stored layout. The acceptance harness gives
 * both 5 s to reach `data-ready` (spec 15.2, item 5).
 *
 * A seeded generator writes it, so every run gives the same workspace, and
 * `test/large-landscape.test.js` holds the committed copy to it. The copy
 * is indented by four spaces, as Biome formats JSON here. After a change
 * here, write the copy again:
 *
 *   pnpm fixtures:large
 */

import { fileURLToPath } from "node:url";
import { writeFixture } from "./fixtures.js";

/** Where the committed copy lives, for the harness and `pnpm dev`. */
export const LARGE_LANDSCAPE_FIXTURE = fileURLToPath(
    new URL("../__fixtures__/large-landscape.json", import.meta.url),
);

/** The key of the view Dagre lays out at render time. */
export const AUTOMATIC_VIEW = "LargeLandscapeAutomatic";
/** The key of the view that stores every element's position. */
export const STORED_VIEW = "LargeLandscapeStored";

/** How many people and software systems the landscape holds (spec 15.3). */
const ELEMENTS = 300;
/** How many relationships join them, none repeated (spec 15.3). */
const RELATIONSHIPS = 600;
/** How many groups the software systems fall into (spec 15.3). */
const GROUPS = 20;
/**
 * Software systems per group. The elements past
 * `GROUPS * SYSTEMS_PER_GROUP` are people, in no group.
 */
const SYSTEMS_PER_GROUP = 14;
/**
 * The tier of each member of a group, by its place in the group: front-end
 * systems, then services, then systems of record. A relationship runs from
 * a tier to a later one, and people use front-end systems, so the landscape
 * reads top to bottom as most do.
 */
const TIERS = [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3];
/** The share of relationships between systems that stay inside a group. */
const WITHIN_GROUP_SHARE = 0.7;
/** The generator's seed: change it and the whole landscape changes. */
const SEED = 51;

/**
 * How many groups sit side by side in a row of the stored layout, a grid of
 * groups, each a grid of elements.
 */
const GROUP_COLUMNS = 5;
/** How many members of a group sit side by side in a row of it. */
const MEMBER_COLUMNS = 4;
/** The width of each element's cell, the element and the gap to its right. */
const CELL_WIDTH = 700;
/** The height of each element's cell, the element and the gap below it. */
const CELL_HEIGHT = 650;
/** The space between two groups' members, room enough for both bands. */
const GROUP_GAP = 500;
/**
 * Where the grid starts. An element at (0,0) counts as unplaced (spec 7), so
 * the grid keeps clear of it.
 */
const MARGIN = 100;

/** Mulberry32: a small seeded generator, uniform in [0, 1). */
export function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = (number) => String(number).padStart(2, "0");

/** The group element `index` (from 0) belongs to, or null. */
const groupOf = (index) =>
    index < GROUPS * SYSTEMS_PER_GROUP
        ? `Group ${pad(Math.floor(index / SYSTEMS_PER_GROUP) + 1)}`
        : null;

/** Where element `index` sits in the stored layout. */
function storedPosition(index) {
    const blockWidth = MEMBER_COLUMNS * CELL_WIDTH + GROUP_GAP;
    const blockHeight =
        Math.ceil(SYSTEMS_PER_GROUP / MEMBER_COLUMNS) * CELL_HEIGHT + GROUP_GAP;
    if (index >= GROUPS * SYSTEMS_PER_GROUP) {
        // The ungrouped elements, in rows under the grid of groups.
        const at = index - GROUPS * SYSTEMS_PER_GROUP;
        const columns = GROUP_COLUMNS * MEMBER_COLUMNS;
        return {
            x: MARGIN + (at % columns) * CELL_WIDTH,
            y:
                MARGIN +
                Math.ceil(GROUPS / GROUP_COLUMNS) * blockHeight +
                Math.floor(at / columns) * CELL_HEIGHT,
        };
    }
    const group = Math.floor(index / SYSTEMS_PER_GROUP);
    const member = index % SYSTEMS_PER_GROUP;
    return {
        x:
            MARGIN +
            (group % GROUP_COLUMNS) * blockWidth +
            (member % MEMBER_COLUMNS) * CELL_WIDTH,
        y:
            MARGIN +
            Math.floor(group / GROUP_COLUMNS) * blockHeight +
            Math.floor(member / MEMBER_COLUMNS) * CELL_HEIGHT,
    };
}

/** The workspace, the same on every call. */
export function largeLandscape() {
    const next = random(SEED);
    const pick = (items) => items[Math.floor(next() * items.length)];

    const elements = Array.from({ length: ELEMENTS }, (_, index) => {
        const id = String(index + 1);
        const group = groupOf(index);
        return {
            id,
            tags: group ? "Element,Software System" : "Element,Person",
            name: group ? `System ${id}` : `Person ${id}`,
            description: group
                ? `Software system ${id} of the large landscape.`
                : `Uses the front-end systems of the landscape, person ${id}.`,
            ...(group ? { group } : {}),
            location: "Unspecified",
            relationships: [],
        };
    });
    const tierOf = (element) => {
        const index = Number(element.id) - 1;
        return element.group ? TIERS[index % SYSTEMS_PER_GROUP] : 0;
    };

    const pairs = new Set();
    let id = ELEMENTS;
    while (pairs.size < RELATIONSHIPS) {
        const source = pick(elements.filter((e) => tierOf(e) < 3));
        const inside = source.group && next() < WITHIN_GROUP_SHARE;
        const destination = pick(
            elements.filter(
                (e) =>
                    e.group &&
                    (source.group
                        ? tierOf(e) > tierOf(source) &&
                          (e.group === source.group) === inside
                        : tierOf(e) === 1),
            ),
        );
        const pair = `${source.id}->${destination.id}`;
        if (pairs.has(pair)) continue;
        pairs.add(pair);
        id += 1;
        source.relationships.push({
            id: String(id),
            tags: "Relationship",
            sourceId: source.id,
            destinationId: destination.id,
            description: "Uses",
            technology: pick(["HTTPS", "gRPC", "AMQP", "SQL"]),
        });
    }

    const relationshipIds = elements.flatMap((element) =>
        element.relationships.map((relationship) => ({ id: relationship.id })),
    );
    const people = elements.filter((element) =>
        element.tags.endsWith("Person"),
    );
    const systems = elements.filter((element) => !people.includes(element));

    return {
        id: 0,
        name: "Large landscape",
        description:
            "A system landscape with 300 elements, 600 relationships and 20 groups, written by test/support/large-landscape.js.",
        configuration: {},
        model: { people, softwareSystems: systems },
        documentation: {},
        views: {
            systemLandscapeViews: [
                {
                    key: AUTOMATIC_VIEW,
                    order: 1,
                    title: "Large landscape, automatic layout",
                    automaticLayout: {
                        implementation: "Graphviz",
                        rankDirection: "TopBottom",
                        rankSeparation: 300,
                        nodeSeparation: 300,
                        edgeSeparation: 0,
                        vertices: false,
                    },
                    enterpriseBoundaryVisible: false,
                    elements: elements.map((element) => ({
                        id: element.id,
                        x: 0,
                        y: 0,
                    })),
                    relationships: relationshipIds,
                },
                {
                    key: STORED_VIEW,
                    order: 2,
                    title: "Large landscape, stored layout",
                    enterpriseBoundaryVisible: false,
                    elements: elements.map((element, index) => ({
                        id: element.id,
                        ...storedPosition(index),
                    })),
                    relationships: relationshipIds,
                },
            ],
            configuration: {
                branding: {},
                styles: {
                    elements: [
                        {
                            tag: "Person",
                            shape: "Person",
                            background: "#08427b",
                            color: "#ffffff",
                        },
                        {
                            tag: "Software System",
                            background: "#1168bd",
                            color: "#ffffff",
                        },
                    ],
                },
                terminology: {},
            },
        },
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFixture(LARGE_LANDSCAPE_FIXTURE, largeLandscape());
    process.stdout.write(`Wrote ${LARGE_LANDSCAPE_FIXTURE}\n`);
}
