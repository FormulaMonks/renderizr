// Turns one Structurizr view into a compound graph: leaf boxes nested in the boundaries the
// current renderer would draw around them (software-system boundary on a container view,
// deployment nodes several levels deep on a deployment view, groups when elements carry one).
// The result is renderer-neutral so the same graph can be fed to Dagre and to ELK.
//
// Sizes follow the vendored renderer: 450x300 by default, 400x400 for Person/Robot shapes,
// overridden by any `width`/`height` on a matching element style. Boundary sizes are not
// inputs — both layout engines size them from their children.

const DEFAULT_WIDTH = 450;
const DEFAULT_HEIGHT = 300;
const PERSON_SIZE = 400;

/** Flatten the model into id -> { id, name, type, parentId, tags, ... }. */
export function indexModel(workspace) {
    const byId = new Map();
    const add = (element, type, parentId) => {
        byId.set(element.id, { ...element, type, parentId });
    };
    const m = workspace.model ?? {};
    for (const p of m.people ?? []) add(p, "Person");
    for (const s of m.softwareSystems ?? []) {
        add(s, "SoftwareSystem");
        for (const c of s.containers ?? []) {
            add(c, "Container", s.id);
            for (const k of c.components ?? []) add(k, "Component", c.id);
        }
    }
    const walkDeploymentNode = (node, parentId) => {
        add(node, "DeploymentNode", parentId);
        for (const child of node.children ?? [])
            walkDeploymentNode(child, node.id);
        for (const i of node.infrastructureNodes ?? [])
            add(i, "InfrastructureNode", node.id);
        for (const i of node.softwareSystemInstances ?? [])
            add(i, "SoftwareSystemInstance", node.id);
        for (const i of node.containerInstances ?? [])
            add(i, "ContainerInstance", node.id);
    };
    for (const d of m.deploymentNodes ?? []) walkDeploymentNode(d, undefined);
    return byId;
}

export function findView(workspace, key) {
    for (const [kind, list] of Object.entries(workspace.views ?? {})) {
        if (!Array.isArray(list)) continue;
        const v = list.find((view) => view.key === key);
        if (v) return { ...v, viewType: kind };
    }
    throw new Error(`view ${key} not found`);
}

function sizeFor(element, model, styles) {
    let tags = element.tags ?? "";
    if (
        element.type === "ContainerInstance" ||
        element.type === "SoftwareSystemInstance"
    ) {
        const target = model.get(
            element.containerId ?? element.softwareSystemId,
        );
        tags = `${target?.tags ?? ""},${tags}`;
    }
    const tagList = tags.split(",").map((t) => t.trim());
    let width;
    let height;
    let shape;
    for (const style of styles) {
        if (!tagList.includes(style.tag)) continue;
        if (style.width) width = style.width;
        if (style.height) height = style.height;
        if (style.shape) shape = style.shape;
    }
    if (
        width === undefined &&
        height === undefined &&
        (shape === "Person" || shape === "Robot")
    ) {
        return { width: PERSON_SIZE, height: PERSON_SIZE };
    }
    return { width: width ?? DEFAULT_WIDTH, height: height ?? DEFAULT_HEIGHT };
}

/**
 * Build the compound graph for a view.
 *
 * @param {object} workspace parsed workspace JSON
 * @param {string} viewKey
 * @param {{ groups?: Record<string, string> }} [opts] optional synthetic groups: element id -> group name
 *   (Big Bank has no groups; this lets the container view exercise boundary -> group -> element nesting)
 * @returns {{ nodes: Array<{id,label,width,height,parent,kind}>, edges: Array<{id,source,target}> }}
 */
export function buildViewGraph(workspace, viewKey, opts = {}) {
    const model = indexModel(workspace);
    const view = findView(workspace, viewKey);
    const styles = workspace.views?.configuration?.styles?.elements ?? [];
    const nodes = new Map();
    const ensure = (id, node) => {
        if (!nodes.has(id)) nodes.set(id, node);
        return nodes.get(id);
    };
    const inView = new Set((view.elements ?? []).map((e) => e.id));
    const isDeployment = view.viewType === "deploymentViews";

    for (const ev of view.elements ?? []) {
        const element = model.get(ev.id);
        if (!element) continue;
        if (element.type === "DeploymentNode") {
            // Boundary: sized by the engine; parent is the enclosing deployment node when it is in the view.
            ensure(element.id, {
                id: element.id,
                label: element.name,
                width: 0,
                height: 0,
                parent: inView.has(element.parentId)
                    ? element.parentId
                    : undefined,
                kind: "boundary",
            });
            continue;
        }
        const { width, height } = sizeFor(element, model, styles);
        let parent;
        if (isDeployment) {
            parent = inView.has(element.parentId)
                ? element.parentId
                : undefined;
        } else if (
            view.viewType === "containerViews" &&
            element.type === "Container"
        ) {
            parent = element.parentId;
        } else if (
            view.viewType === "componentViews" &&
            (element.type === "Component" || element.type === "Container")
        ) {
            parent = element.parentId;
        }
        if (parent !== undefined && !nodes.has(parent) && !inView.has(parent)) {
            // Implicit boundary (software system around its containers, container around its components).
            const boundaryElement = model.get(parent);
            ensure(parent, {
                id: parent,
                label: boundaryElement?.name ?? parent,
                width: 0,
                height: 0,
                parent: undefined,
                kind: "boundary",
            });
        }
        const groupName = opts.groups?.[element.id] ?? element.group;
        if (groupName) {
            const groupId = `group:${parent ?? "root"}:${groupName}`;
            ensure(groupId, {
                id: groupId,
                label: groupName,
                width: 0,
                height: 0,
                parent,
                kind: "group",
            });
            parent = groupId;
        }
        ensure(element.id, {
            id: element.id,
            label: element.name,
            width,
            height,
            parent,
            kind: "element",
        });
    }

    // Drop boundaries with no descendants (the renderer removes empty deployment nodes too).
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes.values()) {
            if (node.kind === "element") continue;
            const hasChild = [...nodes.values()].some(
                (n) => n.parent === node.id,
            );
            if (!hasChild) {
                nodes.delete(node.id);
                changed = true;
            }
        }
    }

    const edges = [];
    for (const rv of view.relationships ?? []) {
        const rel = findRelationship(workspace, rv.id);
        if (!rel) continue;
        if (!nodes.has(rel.sourceId) || !nodes.has(rel.destinationId)) continue;
        edges.push({
            id: rel.id,
            source: rel.sourceId,
            target: rel.destinationId,
        });
    }
    return { nodes: [...nodes.values()], edges, view };
}

function findRelationship(workspace, id) {
    const stack = [workspace.model];
    while (stack.length) {
        const obj = stack.pop();
        if (!obj || typeof obj !== "object") continue;
        if (Array.isArray(obj)) {
            stack.push(...obj);
            continue;
        }
        for (const rel of obj.relationships ?? [])
            if (rel.id === id) return rel;
        for (const [k, v] of Object.entries(obj))
            if (k !== "relationships" && typeof v === "object") stack.push(v);
    }
    return undefined;
}

/** Depth of nesting, counting the root level as 0. */
export function nestingDepth(graph) {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    let max = 0;
    for (const n of graph.nodes) {
        let d = 0;
        let cur = n;
        while (cur.parent) {
            d++;
            cur = byId.get(cur.parent);
        }
        max = Math.max(max, d);
    }
    return max;
}
