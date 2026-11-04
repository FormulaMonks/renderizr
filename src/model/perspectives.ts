/**
 * Which elements and relationships carry a perspective. One rule serves the
 * fade, the names a view lists and the `Perspective:<name>` style lookup, so
 * they never disagree.
 *
 * An element or relationship carries a perspective when it has one of that
 * name, dynamic ones (with a `url`) included. A software system or container
 * instance carries the perspectives of what it instantiates, and an implied
 * relationship those of the relationship it links to, recursively through
 * `linkedRelationshipId`. Its own perspective wins over one it inherits.
 * Groups and boundaries never carry one; a view's caller leaves out the
 * elements it draws as boundaries.
 */

import type { ResolvedView } from "./resolve-view";
import type { ModelElement, ModelRelationship, Perspective } from "./types";
import type { WorkspaceModel } from "./workspace";

/** An element or relationship a perspective can attach to. */
export type PerspectiveItem =
    | Partial<ModelElement>
    | Partial<ModelRelationship>;

/** The element types that never carry a perspective. */
const NEVER_CARRY = new Set(["Group", "Boundary"]);

/** What an instance instantiates, or `undefined` for anything else. */
function instantiated(
    model: WorkspaceModel,
    element: Partial<ModelElement>,
): ModelElement | undefined {
    if (element.type === "SoftwareSystemInstance")
        return model.findElementById(element.softwareSystemId);
    if (element.type === "ContainerInstance")
        return model.findElementById(element.containerId);
    return undefined;
}

/**
 * Every perspective `item` carries, by name: the last of a name wins, and
 * its own over one it inherits.
 */
function carried(
    model: WorkspaceModel,
    item: PerspectiveItem,
): Map<string, Perspective> {
    const found = new Map<string, Perspective>();
    const element = item as Partial<ModelElement>;
    if (element.type !== undefined && NEVER_CARRY.has(element.type))
        return found;
    const add = (perspectives: Perspective[] | undefined) => {
        for (const p of perspectives ?? []) found.set(p.name, p);
    };
    add(instantiated(model, element)?.perspectives);
    const linked = model.findRelationshipById(
        (item as Partial<ModelRelationship>).linkedRelationshipId,
    );
    if (linked) add([...carried(model, linked).values()]);
    add(item.perspectives);
    return found;
}

/**
 * The perspective `item` carries under `name`, dynamic ones included, or
 * `undefined` when it carries none of that name.
 */
export function carriedPerspective(
    model: WorkspaceModel,
    item: PerspectiveItem,
    name: string,
): Perspective | undefined {
    return carried(model, item).get(name);
}

/** Whether `item` carries the perspective `name`. */
export function carriesPerspective(
    model: WorkspaceModel,
    item: PerspectiveItem,
    name: string,
): boolean {
    return carriedPerspective(model, item, name) !== undefined;
}

/**
 * Each perspective name that the elements and relationships `view` draws
 * carry, sorted. Elements it draws as boundaries carry none.
 */
export function perspectiveNames(
    model: WorkspaceModel,
    view: ResolvedView,
): string[] {
    const boundaries = new Set(
        view.boundaries.flatMap((b) => (b.kind === "Element" ? [b.id] : [])),
    );
    const names = new Set<string>();
    const items: PerspectiveItem[] = [
        ...view.elements
            .filter((placed) => !boundaries.has(placed.id))
            .map((placed) => placed.element),
        ...view.relationships.map((placed) => placed.relationship),
    ];
    for (const item of items)
        for (const name of carried(model, item).keys()) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b));
}

/** Whether any element or relationship in the workspace carries `name`. */
export function hasPerspective(model: WorkspaceModel, name: string): boolean {
    const items: PerspectiveItem[] = [
        ...model.getElements(),
        ...model.getRelationships(),
    ];
    return items.some((item) => carriesPerspective(model, item, name));
}
