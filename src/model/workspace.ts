/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), files
 * structurizr-application/src/main/resources/static/static/js/structurizr-workspace.js
 * and structurizr-application/src/main/resources/static/static/js/structurizr-ui.js
 * (getTitleForView, getDefaultViewName).
 *
 * Copyright Structurizr. Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Modified by Renderizr: ported to typed TypeScript, made side-effect free on
 * the JSON it is given, and reduced to the finders, tag collection, view
 * ordering, terminology and view titles the model layer needs.
 */

import type {
    ElementType,
    ModelElement,
    ModelRelationship,
    ModelView,
    StyleDefinition,
    ViewType,
} from "./types";

// biome-ignore lint/suspicious/noExplicitAny: workspace JSON is untyped until registered
type Json = Record<string, any>;

export const DEFAULT_DEPLOYMENT_ENVIRONMENT_NAME = "Default";

/** Styles sorted with unscoped first, then by color scheme and tag. */
export function sortStyles(a: StyleDefinition, b: StyleDefinition): number {
    if (a.colorScheme === undefined && b.colorScheme === undefined) {
        return a.tag.localeCompare(b.tag);
    }
    if (a.colorScheme === undefined) return -1;
    if (b.colorScheme === undefined) return 1;
    return `${a.colorScheme}/${a.tag}`.localeCompare(
        `${b.colorScheme}/${b.tag}`,
    );
}

const VIEW_COLLECTIONS: [string, ViewType][] = [
    ["customViews", "Custom"],
    ["systemLandscapeViews", "SystemLandscape"],
    ["systemContextViews", "SystemContext"],
    ["containerViews", "Container"],
    ["componentViews", "Component"],
    ["dynamicViews", "Dynamic"],
    ["deploymentViews", "Deployment"],
    ["filteredViews", "Filtered"],
    ["imageViews", "Image"],
];

const TERMS: Partial<Record<string, [string, string]>> = {
    Person: ["person", "Person"],
    SoftwareSystem: ["softwareSystem", "Software System"],
    SoftwareSystemInstance: ["softwareSystem", "Software System"],
    Container: ["container", "Container"],
    ContainerInstance: ["container", "Container"],
    Component: ["component", "Component"],
    DeploymentNode: ["deploymentNode", "Deployment Node"],
    InfrastructureNode: ["infrastructureNode", "Infrastructure Node"],
    Enterprise: ["enterprise", "Enterprise"],
};

const splitTags = (tags: string) =>
    tags.split(",").filter((tag) => tag !== undefined && tag.length > 0);

/**
 * A read-only, typed wrapper around a Structurizr workspace: elements and
 * relationships by id, views by key and in drawer order, tags and titles.
 */
export class WorkspaceModel {
    readonly name: string;
    readonly description: string;
    readonly model: Json;
    readonly views: Json;
    readonly configuration: Json;

    #elementsById = new Map<string, ModelElement>();
    #relationshipsById = new Map<string, ModelRelationship>();
    #allViews: ModelView[] = [];
    #views: ModelView[] = [];

    constructor(json: Json) {
        const workspace: Json = structuredClone(json ?? {});
        this.name = workspace.name ?? "";
        this.description = workspace.description ?? "";

        workspace.model ??= {};
        workspace.model.properties ??= {};
        this.model = workspace.model;
        this.#initModel();

        workspace.views ??= {};
        this.views = workspace.views;
        this.configuration = this.#initViews();
    }

    #initModel() {
        const model = this.model;
        const byName = (array: ModelElement[] = []) =>
            array.sort((a, b) => a.name.localeCompare(b.name));

        for (const [collection, type] of [
            ["customElements", "Custom"],
            ["people", "Person"],
        ] as const) {
            model[collection] ??= [];
            for (const element of byName(model[collection])) {
                element.parentId = undefined;
                this.#registerElement(element, type);
            }
        }

        model.softwareSystems ??= [];
        for (const system of byName(model.softwareSystems)) {
            system.parentId = undefined;
            this.#registerElement(system, "SoftwareSystem");
            for (const container of byName(
                system.containers as ModelElement[] | undefined,
            )) {
                container.parentId = system.id;
                this.#registerElement(container, "Container");
                for (const component of byName(
                    container.components as ModelElement[] | undefined,
                )) {
                    component.parentId = container.id;
                    this.#registerElement(component, "Component");
                }
            }
        }

        model.deploymentNodes ??= [];
        for (const node of byName(model.deploymentNodes)) {
            this.#registerDeploymentNode(node, undefined);
        }
    }

    #registerDeploymentNode(node: Json, parent: Json | undefined) {
        node.parentId = parent?.id;
        node.environment ??= DEFAULT_DEPLOYMENT_ENVIRONMENT_NAME;
        this.#registerElement(node as ModelElement, "DeploymentNode");

        node.children ??= [];
        node.children.sort((a: Json, b: Json) => a.name.localeCompare(b.name));
        for (const child of node.children) {
            this.#registerDeploymentNode(child, node);
        }

        node.softwareSystemInstances ??= [];
        for (const instance of node.softwareSystemInstances) {
            const system = this.findElementById(instance.softwareSystemId);
            instance.name = system?.name ?? "";
            instance.description ??= system?.description;
            instance.url ??= system?.url;
            instance.parentId = node.id;
            instance.environment ??= node.environment;
            this.#registerElement(instance, "SoftwareSystemInstance");
        }

        node.containerInstances ??= [];
        for (const instance of node.containerInstances) {
            const container = this.findElementById(instance.containerId);
            instance.name = container?.name ?? "";
            instance.description ??= container?.description;
            instance.technology = container?.technology;
            instance.url ??= container?.url;
            instance.parentId = node.id;
            instance.environment ??= node.environment;
            this.#registerElement(instance, "ContainerInstance");
        }

        node.infrastructureNodes ??= [];
        for (const infrastructure of node.infrastructureNodes) {
            infrastructure.parentId = node.id;
            infrastructure.environment ??= node.environment;
            this.#registerElement(infrastructure, "InfrastructureNode");
        }
    }

    #registerElement(element: ModelElement, type: ElementType) {
        element.type = type;
        this.#elementsById.set(element.id, element);
        for (const relationship of element.relationships ?? []) {
            this.#registerRelationship(relationship);
        }
        if (element.url?.trim().length === 0) element.url = undefined;
        element.properties ??= {};
        element.perspectives ??= [];
    }

    #registerRelationship(relationship: ModelRelationship) {
        this.#relationshipsById.set(relationship.id, relationship);

        let linkedId = relationship.linkedRelationshipId;
        while (!relationship.url?.trim() && linkedId !== undefined) {
            const linked = this.findRelationshipById(linkedId);
            relationship.url = linked?.url;
            linkedId = linked?.linkedRelationshipId;
        }
        if (relationship.url?.trim().length === 0) relationship.url = undefined;
        relationship.properties ??= {};
        relationship.perspectives ??= [];
    }

    #initViews(): Json {
        const views = this.views;
        for (const [collection, type] of VIEW_COLLECTIONS) {
            views[collection] ??= [];
            for (const view of views[collection] as ModelView[]) {
                if (type === "Deployment" && !view.environment?.trim()) {
                    view.environment = DEFAULT_DEPLOYMENT_ENVIRONMENT_NAME;
                }
                view.type = type;
                view.description ??= "";
                if (type !== "Image") {
                    view.elements ??= [];
                    view.relationships ??= [];
                }
                if (type === "Dynamic") {
                    view.relationships.sort((a, b) =>
                        a.order === b.order
                            ? Number(a.id) - Number(b.id)
                            : Number(a.order) - Number(b.order),
                    );
                }
                this.#allViews.push(view);
            }
        }

        views.configuration ??= {};
        const configuration: Json = views.configuration;
        configuration.properties ??= {};
        configuration.styles ??= {};
        configuration.styles.elements = [
            ...(configuration.styles.elements ?? []),
        ].sort(sortStyles);
        configuration.styles.relationships = [
            ...(configuration.styles.relationships ?? []),
        ].sort(sortStyles);
        configuration.metadataSymbols ??= "SquareBrackets";
        configuration.branding ??= {};
        configuration.terminology ??= {};
        configuration.themes ??= [];

        this.#views = this.#sortViews(configuration);
        return configuration;
    }

    #findElementForView(view: ModelView): ModelElement | undefined {
        switch (view.type) {
            case "SystemContext":
            case "Container":
                return this.findElementById(view.softwareSystemId);
            case "Component":
                return this.findElementById(view.containerId);
            case "Deployment":
                return this.findElementById(view.softwareSystemId);
            case "Dynamic":
            case "Image":
                return this.findElementById(view.elementId);
            default:
                return undefined;
        }
    }

    #sortViews(configuration: Json): ModelView[] {
        const viewTypeOrders = [
            "SystemLandscape",
            "SystemContext",
            "Container",
            "Component",
            "Code",
            "Dynamic",
            "Deployment",
            "Image",
        ];
        const elementTypeOrders = [
            "*",
            "SoftwareSystem",
            "Container",
            "Component",
        ];
        const filtered = new Set(
            this.#allViews
                .filter((view) => view.type === "Filtered")
                .map((view) => view.baseViewKey),
        );

        type Entry = {
            view: ModelView;
            key: string;
            viewTypeOrder: number;
            elementTypeOrder: number;
            scope: string;
            softwareSystem?: ModelElement;
        };

        const entries: Entry[] = [];
        for (const view of this.#allViews) {
            if (filtered.has(view.key)) continue;
            const base =
                view.type === "Filtered"
                    ? this.findViewByKey(view.baseViewKey) ?? view
                    : view;
            const entry: Entry = {
                view,
                key: view.key,
                viewTypeOrder: viewTypeOrders.indexOf(base.type),
                elementTypeOrder: elementTypeOrders.indexOf("*"),
                scope: "/",
            };
            const element = this.#findElementForView(base);
            if (element) {
                entry.scope = element.canonicalName ?? "";
                entry.elementTypeOrder = elementTypeOrders.indexOf(
                    element.type,
                );
                if (element.type === "SoftwareSystem") {
                    entry.softwareSystem = element;
                } else if (element.type === "Container") {
                    entry.softwareSystem = this.findElementById(
                        element.parentId,
                    );
                } else if (element.type === "Component") {
                    entry.viewTypeOrder = viewTypeOrders.indexOf("Code");
                    const container = this.findElementById(element.parentId);
                    entry.softwareSystem = this.findElementById(
                        container?.parentId,
                    );
                }
            }
            entries.push(entry);
        }

        const sort = configuration.properties?.["structurizr.sort"];
        if (configuration.viewSortOrder === "Key" || sort === "key") {
            entries.sort((a, b) => a.key.localeCompare(b.key));
        } else if (configuration.viewSortOrder === "Type" || sort === "type") {
            entries.sort((a, b) =>
                `${a.viewTypeOrder}${a.scope}${a.key}`.localeCompare(
                    `${b.viewTypeOrder}${b.scope}${b.key}`,
                ),
            );
        } else if (sort === "created") {
            entries.sort((a, b) => Number(a.view.order) - Number(b.view.order));
        } else {
            entries.sort((a, b) => {
                if (!a.softwareSystem && b.softwareSystem) return -1;
                if (!b.softwareSystem && a.softwareSystem) return 1;
                if (!a.softwareSystem || !b.softwareSystem) {
                    return `${a.viewTypeOrder}${a.key}`.localeCompare(
                        `${b.viewTypeOrder}${b.key}`,
                    );
                }
                const bySystem = a.softwareSystem.name.localeCompare(
                    b.softwareSystem.name,
                );
                if (bySystem !== 0) return bySystem;
                return `${a.viewTypeOrder}.${a.elementTypeOrder}.${a.scope}${a.key}`.localeCompare(
                    `${b.viewTypeOrder}.${b.elementTypeOrder}.${b.scope}${b.key}`,
                );
            });
        }

        return entries.map((entry) => entry.view);
    }

    getElements(): ModelElement[] {
        return [...this.#elementsById.values()];
    }

    findElementById(id: string | undefined): ModelElement | undefined {
        return id === undefined ? undefined : this.#elementsById.get(id);
    }

    getRelationships(): ModelRelationship[] {
        return [...this.#relationshipsById.values()];
    }

    findRelationshipById(
        id: string | undefined,
    ): ModelRelationship | undefined {
        return id === undefined ? undefined : this.#relationshipsById.get(id);
    }

    /** Every tag on an element or relationship, trimmed, sorted, once each. */
    getTags(): string[] {
        const tags = new Set<string>();
        for (const item of [
            ...this.#elementsById.values(),
            ...this.#relationshipsById.values(),
        ]) {
            for (const tag of (item.tags ?? "").split(",")) {
                const trimmed = tag.trim();
                if (trimmed) tags.add(trimmed);
            }
        }
        return [...tags].sort();
    }

    /** An element's tags, instances prefixed with those of what they instantiate. */
    getAllTagsForElement(element: Partial<ModelElement>): string[] {
        let tags = element.tags ?? "";
        const base =
            element.type === "SoftwareSystemInstance"
                ? this.findElementById(element.softwareSystemId)
                : element.type === "ContainerInstance"
                  ? this.findElementById(element.containerId)
                  : undefined;
        if (base?.tags) tags = `${base.tags},${tags}`;
        return splitTags(tags);
    }

    /** A relationship's tags, prefixed with those of the relationships it links to. */
    getAllTagsForRelationship(
        relationship: Partial<ModelRelationship>,
    ): string[] {
        let tags = relationship.tags ?? "";
        let linkedId = relationship.linkedRelationshipId;
        while (linkedId !== undefined) {
            const linked = this.findRelationshipById(linkedId);
            if (linked?.tags) tags = `${linked.tags},${tags}`;
            linkedId = linked?.linkedRelationshipId;
        }
        return splitTags(tags);
    }

    /** Every view except filtered views' bases, in drawer order. */
    getViews(): ModelView[] {
        return this.#views;
    }

    findViewByKey(key: string | undefined): ModelView | undefined {
        let found: ModelView | undefined;
        for (const view of this.#allViews) if (view.key === key) found = view;
        return found;
    }

    #findViews(
        type: ViewType,
        matches: (view: ModelView) => boolean,
    ): ModelView[] {
        return this.#views.filter((view) => {
            const base =
                view.type === "Filtered"
                    ? this.findViewByKey(view.baseViewKey)
                    : view;
            return base?.type === type && matches(base);
        });
    }

    findSystemContextViewsForSoftwareSystem(id: string): ModelView[] {
        return this.#findViews(
            "SystemContext",
            (v) => v.softwareSystemId === id,
        );
    }

    findContainerViewsForSoftwareSystem(id: string): ModelView[] {
        return this.#findViews("Container", (v) => v.softwareSystemId === id);
    }

    findComponentViewsForContainer(id: string): ModelView[] {
        return this.#findViews("Component", (v) => v.containerId === id);
    }

    findDeploymentViewsForSoftwareSystem(id: string): ModelView[] {
        return this.#findViews("Deployment", (v) => v.softwareSystemId === id);
    }

    findDynamicViewsForElement(id: string): ModelView[] {
        return this.views.dynamicViews.filter(
            (view: ModelView) => view.elementId === id,
        );
    }

    findImageViewsForElement(id: string): ModelView[] {
        return this.views.imageViews.filter(
            (view: ModelView) => view.elementId === id,
        );
    }

    /** The type term for an element or relationship, `terminology` applied. */
    getTerminologyFor(item: {
        type?: string;
        sourceId?: string;
        destinationId?: string;
    }): string {
        const term =
            (item.type && TERMS[item.type]) ||
            (item.sourceId && item.destinationId
                ? (["relationship", "Relationship"] as [string, string])
                : undefined);
        if (!term) return "";
        const [key, fallback] = term;
        const terminology = this.configuration.terminology;
        return Object.hasOwn(terminology, key) ? terminology[key] : fallback;
    }

    /** A view's own title, else its name, else one made from its type. */
    getTitleForView(view: ModelView): string {
        if (view.title?.trim()) return view.title;
        if (view.type === "Filtered") {
            const base = this.findViewByKey(view.baseViewKey);
            return base ? this.getTitleForView(base) : "";
        }
        if (view.name?.trim()) return view.name;
        return this.getDefaultViewName(view);
    }

    getDefaultViewName(given: ModelView): string {
        const view =
            given.type === "Filtered"
                ? this.findViewByKey(given.baseViewKey)
                : given;
        if (!view) return "";
        const name = (id: string | undefined) =>
            this.findElementById(id)?.name ?? "";

        switch (view.type) {
            case "Custom":
                return `Custom View: ${view.title?.trim() ? view.title : "Untitled"}`;
            case "SystemLandscape": {
                const enterprise = this.model.enterprise;
                return `System Landscape View${enterprise ? `: ${enterprise.name}` : ""}`;
            }
            case "SystemContext":
                return `System Context View: ${name(view.softwareSystemId)}`;
            case "Container":
                return `Container View: ${name(view.softwareSystemId)}`;
            case "Component": {
                const container = this.findElementById(view.containerId);
                return `Component View: ${name(container?.parentId)} - ${container?.name ?? ""}`;
            }
            case "Dynamic": {
                const element =
                    this.findElementById(view.elementId) ??
                    this.findElementById(view.softwareSystemId);
                if (!element) return "Dynamic View";
                if (element.type === "SoftwareSystem") {
                    return `Dynamic View: ${element.name}`;
                }
                if (element.type === "Container") {
                    return `Dynamic View: ${name(element.parentId)} - ${element.name}`;
                }
                return "";
            }
            case "Deployment":
                return view.softwareSystemId
                    ? `Deployment View: ${name(view.softwareSystemId)} - ${view.environment}`
                    : `Deployment View: ${view.environment}`;
            case "Image":
                return `Image View: ${view.key}`;
            default:
                return "";
        }
    }
}
