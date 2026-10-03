/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), files
 * structurizr-application/src/main/resources/static/static/js/structurizr-ui.js
 * (ElementStyle, RelationshipStyle, findElementStyle, findRelationshipStyle,
 * getElementStylesForPerspective, getRelationshipStylesForPerspective),
 * structurizr-application/src/main/resources/static/static/js/structurizr-util.js
 * (shadeColor) and
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (findStyleForPerspective, applyElementStyleForPerspective,
 * applyRelationshipStyleForPerspective, getPerspectiveForElement,
 * createBoundary).
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
 * Modified by Renderizr: ported to typed TypeScript, made a pure function of
 * the workspace, the color scheme, the themes and an optional perspective;
 * an unset stroke is the background darkened 10% in both color schemes;
 * dynamic (URL-polled) perspectives are ignored; a boundary's style resolved
 * without its shape, which the engine reduces to a rectangle, and groups and
 * the enterprise boundary styled from their own tags alone.
 */

import { sortStyles, type WorkspaceModel } from "./workspace";
import type {
    ColorScheme,
    ModelElement,
    ModelRelationship,
    Perspective,
    StyleDefinition,
    Theme,
} from "./types";

export const SCHEME_DEFAULTS: Record<
    ColorScheme,
    { background: string; color: string; strokeWidth: number }
> = {
    Light: { background: "#ffffff", color: "#444444", strokeWidth: 2 },
    Dark: { background: "#111111", color: "#cccccc", strokeWidth: 2 },
};

export type ElementStyle = {
    tags: string[];
    width: number;
    height: number;
    background: string;
    /** Unset only on a `Boundary`, which takes it from what it represents. */
    stroke?: string;
    strokeWidth?: number;
    color?: string;
    fontSize: number;
    shape?: string;
    icon?: string;
    iconPosition: string;
    border?: string;
    opacity: number;
    metadata: boolean;
    description: boolean;
};

export type RelationshipStyle = {
    tags: string[];
    thickness: number;
    color: string;
    dashed: boolean;
    style: "Solid" | "Dashed" | "Dotted";
    routing: string;
    jump?: boolean;
    fontSize: number;
    width: number;
    position: number;
    opacity: number;
    metadata: boolean;
    description: boolean;
};

const ELEMENT_ATTRIBUTES = [
    "width",
    "height",
    "background",
    "stroke",
    "strokeWidth",
    "color",
    "fontSize",
    "shape",
    "icon",
    "iconPosition",
    "border",
    "opacity",
    "metadata",
    "description",
] as const;

const RELATIONSHIP_ATTRIBUTES = [
    "thickness",
    "color",
    "dashed",
    "style",
    "routing",
    "jump",
    "fontSize",
    "width",
    "position",
    "opacity",
    "metadata",
    "description",
] as const;

function copyIfSpecified(
    source: Record<string, unknown>,
    destination: Record<string, unknown>,
    names: readonly string[],
) {
    for (const name of names) {
        if (Object.hasOwn(source, name)) destination[name] = source[name];
    }
}

/**
 * Lighten (positive) or darken (negative) a `#rrggbb` color by a percentage,
 * capped at 90%.
 */
export function shadeColor(color: string, percentAsInteger: number): string {
    const percent =
        percentAsInteger === 0
            ? 0
            : percentAsInteger > 90
              ? 0.9
              : percentAsInteger / 100;
    const f = Number.parseInt(color.slice(1), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent);
    const R = f >> 16;
    const G = (f >> 8) & 0xff;
    const B = f & 0xff;
    return `#${(
        0x1000000 +
        (Math.round((t - R) * p) + R) * 0x10000 +
        (Math.round((t - G) * p) + G) * 0x100 +
        (Math.round((t - B) * p) + B)
    )
        .toString(16)
        .slice(1)}`;
}

const inScheme = (style: StyleDefinition, scheme: ColorScheme) =>
    style.colorScheme === undefined || style.colorScheme === scheme;

/** Theme styles first, then the workspace's own, as one cascade. */
function definitions(
    model: WorkspaceModel,
    kind: "elements" | "relationships",
    themes: Theme[],
): StyleDefinition[] {
    return [
        ...themes.flatMap((theme) => [...(theme[kind] ?? [])].sort(sortStyles)),
        ...(model.configuration.styles[kind] as StyleDefinition[]),
    ];
}

/** One merged definition per tag, for the given color scheme. */
function stylesByTag(
    styles: StyleDefinition[],
    scheme: ColorScheme,
    attributes: readonly string[],
): Map<string, StyleDefinition> {
    const map = new Map<string, StyleDefinition>();
    for (const definition of styles) {
        if (!inScheme(definition, scheme)) continue;
        const existing = map.get(definition.tag);
        if (existing) copyIfSpecified(definition, existing, attributes);
        else map.set(definition.tag, { ...definition });
    }
    return map;
}

/** The `Perspective:<name>` style that applies to a perspective's value. */
function perspectiveStyle(
    styles: StyleDefinition[],
    scheme: ColorScheme,
    name: string,
    perspective: Perspective,
): StyleDefinition | undefined {
    const prefix = `Perspective:${name}`;
    const candidates = styles.filter(
        (style) => style.tag.indexOf(prefix) === 0 && inScheme(style, scheme),
    );
    let found: StyleDefinition | undefined;
    for (const style of candidates) {
        if (!style.tag.includes("[")) found = style;
    }
    for (const style of candidates) {
        if (style.tag.indexOf("[value") > 0) {
            const expression = style.tag.slice(style.tag.indexOf("[") + 1, -1);
            if (
                expression.startsWith("value==") &&
                perspective.value === expression.slice("value==".length)
            ) {
                found = style;
            }
        }
    }
    return found;
}

/**
 * The static perspective an element or relationship carries under `name`.
 * Instances fall back to what they instantiate. Dynamic perspectives (those
 * with a `url`) are polled by upstream and ignored here.
 */
function findPerspective(
    model: WorkspaceModel,
    item: Partial<ModelElement> | Partial<ModelRelationship>,
    name: string,
): Perspective | undefined {
    const own = (perspectives: Perspective[] | undefined) => {
        let found: Perspective | undefined;
        for (const p of perspectives ?? []) if (p.name === name) found = p;
        return found;
    };
    let perspective = own(item.perspectives);
    if (!perspective && "type" in item) {
        const element = item as Partial<ModelElement>;
        const base =
            element.type === "SoftwareSystemInstance"
                ? model.findElementById(element.softwareSystemId)
                : element.type === "ContainerInstance"
                  ? model.findElementById(element.containerId)
                  : undefined;
        perspective = own(base?.perspectives);
    }
    return perspective?.url ? undefined : perspective;
}

/**
 * Resolve an element's style: scheme defaults, then each of its tags in
 * order, themes before the workspace, `colorScheme`-scoped styles only in
 * their scheme. With `perspective`, a matching `Perspective:<name>` style
 * overrides background, color and stroke.
 */
export function findElementStyle(
    model: WorkspaceModel,
    element: Partial<ModelElement>,
    scheme: ColorScheme = "Light",
    themes: Theme[] = [],
    perspective?: string,
): ElementStyle {
    const implied = ["Element"];
    if (element.type === "DeploymentNode") implied.push("Deployment Node");
    if (element.type === "Group") implied.push("Group");
    if (element.type === "Boundary") implied.push("Boundary");
    return resolveElementStyle(
        model,
        element,
        implied,
        scheme,
        themes,
        perspective,
    );
}

/**
 * `findElementStyle` with the tags listed before the element's own given by
 * the caller: a group or the enterprise boundary lists none, so its style
 * names only the tags it was resolved from.
 */
function resolveElementStyle(
    model: WorkspaceModel,
    element: Partial<ModelElement>,
    implied: string[],
    scheme: ColorScheme,
    themes: Theme[],
    perspective?: string,
): ElementStyle {
    const defaults = SCHEME_DEFAULTS[scheme];
    const styles = definitions(model, "elements", themes);
    const byTag = stylesByTag(styles, scheme, ELEMENT_ATTRIBUTES);

    // biome-ignore lint/suspicious/noExplicitAny: built up attribute by attribute from untyped styles
    const style: Record<string, any> = {
        width: 450,
        height: 300,
        iconPosition: "Bottom",
        opacity: 100,
        metadata: true,
        description: true,
        tags: [...implied],
    };
    let defaultSizeInUse = true;

    for (const raw of model.getAllTagsForElement(element)) {
        let tag = raw.trim();
        const definition = byTag.get(tag);
        if (!definition) continue;
        if (definition.width !== undefined || definition.height !== undefined) {
            defaultSizeInUse = false;
        }
        copyIfSpecified(definition, style, ELEMENT_ATTRIBUTES);
        if (tag.startsWith("Group:")) tag = tag.slice("Group:".length);
        if (!style.tags.includes(tag)) style.tags.push(tag);
    }

    const boundary = element.type === "Boundary";
    if (style.background !== undefined && style.stroke === undefined) {
        style.stroke = shadeColor(style.background, -10);
    }
    style.background ??= defaults.background;
    if (!boundary) {
        style.stroke ??= defaults.color;
        style.color ??= defaults.color;
        style.strokeWidth ??= defaults.strokeWidth;
        style.shape ??= "Box";
    }
    if (style.strokeWidth !== undefined) {
        style.strokeWidth = Math.min(10, Math.max(1, style.strokeWidth));
    }
    if (style.border === undefined && !boundary) {
        style.border = element.type === "Group" ? "Dotted" : "Solid";
    }

    const swap = () => {
        [style.width, style.height] = [style.height, style.width];
    };
    if (style.shape === "MobileDevicePortrait" && style.height < style.width) {
        swap();
    }
    if (style.shape === "MobileDeviceLandscape" && style.height > style.width) {
        swap();
    }
    if (
        defaultSizeInUse &&
        (style.shape === "Person" || style.shape === "Robot")
    ) {
        style.width = 400;
        style.height = 400;
    }

    style.fontSize ??= element.tags === "Diagram:Title" ? 36 : 24;

    if (perspective) {
        const p = findPerspective(model, element, perspective);
        const override = p && perspectiveStyle(styles, scheme, perspective, p);
        if (override) {
            const background =
                (override.background as string | undefined) ?? style.background;
            style.background = background;
            style.color = (override.color as string | undefined) ?? style.color;
            style.stroke =
                (override.stroke as string | undefined) ??
                shadeColor(background, -10);
        }
    }

    return style as ElementStyle;
}

/**
 * Resolve a relationship's style: scheme defaults, then each of its tags
 * (linked relationships' first), themes before the workspace. With
 * `perspective`, a matching `Perspective:<name>` style overrides the color.
 */
export function findRelationshipStyle(
    model: WorkspaceModel,
    relationship: Partial<ModelRelationship>,
    scheme: ColorScheme = "Light",
    themes: Theme[] = [],
    perspective?: string,
): RelationshipStyle {
    const defaults = SCHEME_DEFAULTS[scheme];
    const styles = definitions(model, "relationships", themes);
    const byTag = stylesByTag(styles, scheme, RELATIONSHIP_ATTRIBUTES);

    // biome-ignore lint/suspicious/noExplicitAny: built up attribute by attribute from untyped styles
    const style: Record<string, any> = {
        thickness: 2,
        color: defaults.color,
        dashed: true,
        routing: "Direct",
        fontSize: 24,
        width: 200,
        position: 50,
        opacity: 100,
        metadata: true,
        description: true,
        tags: ["Relationship"],
    };

    for (const raw of model.getAllTagsForRelationship(relationship)) {
        const tag = raw.trim();
        const definition = byTag.get(tag);
        if (!definition) continue;
        copyIfSpecified(definition, style, RELATIONSHIP_ATTRIBUTES);
        if (!style.tags.includes(tag)) style.tags.push(tag);
    }

    style.style ??= style.dashed === false ? "Solid" : "Dashed";
    style.thickness = Math.min(10, Math.max(1, style.thickness));

    if (perspective) {
        const p = findPerspective(model, relationship, perspective);
        const override = p && perspectiveStyle(styles, scheme, perspective, p);
        if (override?.color) style.color = override.color;
    }

    return style as RelationshipStyle;
}

/* -------------------------------------------------------------- boundaries */

/** Only the attributes `tags` set explicitly, merged in tag order. */
function explicitAttributes(
    model: WorkspaceModel,
    tags: string[],
    scheme: ColorScheme,
    themes: Theme[],
): Partial<ElementStyle> {
    const byTag = stylesByTag(
        definitions(model, "elements", themes),
        scheme,
        ELEMENT_ATTRIBUTES,
    );
    const merged: Record<string, unknown> = {};
    for (const tag of tags) {
        const definition = byTag.get(tag);
        if (definition) copyIfSpecified(definition, merged, ELEMENT_ATTRIBUTES);
    }
    return merged as Partial<ElementStyle>;
}

/**
 * How an element drawn as a boundary is styled (spec 8, ported from
 * upstream's `createBoundary`). A software system or container starts from
 * its own resolved style, overridden field by field by `Boundary` and
 * `Boundary:<type>`: its fill is the canvas background unless a boundary
 * style sets one, its stroke is the element's resolved stroke unless a
 * boundary style sets one, and text the color of the fill falls back to the
 * stroke. A deployment node keeps its own style. The engine draws whatever
 * shape it names as a rectangle (spec 8).
 */
export function findBoundaryStyle(
    model: WorkspaceModel,
    element: ModelElement,
    scheme: ColorScheme = "Light",
    themes: Theme[] = [],
    perspective?: string,
): ElementStyle {
    const style = findElementStyle(model, element, scheme, themes, perspective);
    if (element.type === "DeploymentNode") return style;

    const override = explicitAttributes(
        model,
        ["Boundary", `Boundary:${element.type}`],
        scheme,
        themes,
    );
    const background =
        override.background ?? SCHEME_DEFAULTS[scheme].background;
    const stroke = override.stroke ?? style.stroke;
    const color =
        override.color ?? (style.color === background ? stroke : style.color);

    return {
        ...style,
        tags: ["Boundary", ...style.tags],
        background,
        stroke,
        color,
        strokeWidth: override.strokeWidth ?? style.strokeWidth,
        border: override.border ?? style.border,
        fontSize: override.fontSize ?? style.fontSize,
        icon: override.icon ?? style.icon,
        shape: override.shape ?? style.shape,
    };
}

/**
 * How a group is styled: `Group` and `Group:<full path>` alone, so a nested
 * group inherits nothing from the groups around it and nothing comes from
 * `Element` (spec 8). Dotted unless a style says otherwise.
 */
export function findGroupStyle(
    model: WorkspaceModel,
    path: string,
    scheme: ColorScheme = "Light",
    themes: Theme[] = [],
): ElementStyle {
    return resolveElementStyle(
        model,
        { type: "Group", tags: `Group,Group:${path}` },
        [],
        scheme,
        themes,
    );
}

/**
 * How the enterprise boundary is styled: `Boundary` and
 * `Boundary:Enterprise` alone, nothing from `Element` or `Group` (spec 8).
 * Dotted unless a style says otherwise, as upstream draws it.
 */
export function findEnterpriseStyle(
    model: WorkspaceModel,
    scheme: ColorScheme = "Light",
    themes: Theme[] = [],
): ElementStyle {
    return resolveElementStyle(
        model,
        { type: "Group", tags: "Boundary,Boundary:Enterprise" },
        [],
        scheme,
        themes,
    );
}
