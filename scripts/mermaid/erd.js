/**
 * Turns Mermaid's parsed ERD (`ErDB`) into the plain model the page draws
 * (spec: ERD entities): entities with their attributes, relationships with
 * their End markers, classes and direction, every label as plain text. The
 * page sizes entities, collapsed or expanded, and styles them; nothing here
 * guesses a size or writes a style.
 *
 * What it leaves out goes to `ignored`. A construct that would change what
 * the diagram means throws `NotDrawnYet`, which fails the whole diagram.
 */

import { plainLabel } from "./flowchart.js";
import { checkCss, NODE_CSS } from "./styling.js";
import { NotDrawnYet } from "./warnings.js";

/** Mermaid's cardinalities onto End marker names (spec: End markers). */
const CARDINALITIES = {
    ONLY_ONE: "one",
    ZERO_OR_ONE: "zeroOrOne",
    ONE_OR_MORE: "oneOrMore",
    ZERO_OR_MORE: "zeroOrMore",
};

/**
 * The End marker for one of Mermaid's cardinalities. The parent one, and
 * any Renderizr doesn't know, carries meaning, so it fails the diagram.
 */
function markerOf(cardinality) {
    if (cardinality === "MD_PARENT")
        throw new NotDrawnYet('the cardinality "u" (parent)');
    const marker = Object.hasOwn(CARDINALITIES, cardinality)
        ? CARDINALITIES[cardinality]
        : undefined;
    if (!marker) throw new NotDrawnYet(`the cardinality "${cardinality}"`);
    return marker;
}

/** Mermaid's directions; `TD` is `TB`. */
const DIRECTIONS = { TB: "TB", TD: "TB", BT: "BT", LR: "LR", RL: "RL" };

/** A class list without Mermaid's own `default`. */
const classesOf = (value) =>
    String(value ?? "")
        .split(/\s+/)
        .filter((c) => c && c !== "default");

/**
 * The page's model of the ERD `db` parsed. Entities keep the names the
 * source gives them as ids, in Mermaid's order; relationships are numbered
 * in source order and point from their first entity to their second.
 */
export function readErd(db, ignored) {
    if (db.getSubGraphs?.().length) throw new NotDrawnYet("an ERD subgraph");

    const names = new Map();
    const entities = [];
    for (const [name, entity] of db.getEntities()) {
        names.set(entity.id, name);
        checkCss(entity.cssStyles, NODE_CSS, ignored);
        entities.push({
            id: name,
            label: plainLabel(entity.alias || entity.label) || name,
            attributes: (entity.attributes ?? []).map(
                ({ type, name, keys, comment }) => ({
                    type: String(type ?? ""),
                    name: String(name ?? ""),
                    keys: [...(keys ?? [])],
                    comment: plainLabel(comment),
                }),
            ),
            classes: classesOf(entity.cssClasses),
            styles: entity.cssStyles ?? [],
        });
    }

    const relationships = db
        .getRelationships()
        .flatMap((relationship, index) => {
            const source = names.get(relationship.entityA);
            const target = names.get(relationship.entityB);
            if (source === undefined || target === undefined) return [];
            const { cardA, cardB, relType } = relationship.relSpec;
            return [
                {
                    id: String(index),
                    source,
                    target,
                    label: plainLabel(relationship.roleA),
                    identifying: relType !== "NON_IDENTIFYING",
                    // Mermaid names the ends backwards: `cardB` sits at the
                    // first entity and `cardA` at the second.
                    start: markerOf(cardB),
                    end: markerOf(cardA),
                },
            ];
        });

    for (const definition of db.getClasses().values())
        checkCss(definition.styles, NODE_CSS, ignored);
    const classDefs = Object.fromEntries(
        [...db.getClasses()].map(([name, definition]) => [
            name,
            definition.styles ?? [],
        ]),
    );

    return {
        kind: "er",
        direction: DIRECTIONS[db.getDirection()] ?? "TB",
        entities,
        relationships,
        classDefs,
    };
}
