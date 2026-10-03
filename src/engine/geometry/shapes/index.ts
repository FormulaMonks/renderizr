/**
 * The shape registry: which of the 19 Structurizr shapes a style names, the
 * box upstream draws each in, and the geometry of any of them at any size
 * (spec 9.4). Each shape's proportions live in its own module; the ray math
 * they share (`intersect`, `touch`) lives in `outline.ts`.
 */

import { box, roundedBox } from "./box";
import { bucket, cylinder, pipe } from "./cylinder";
import { circle, ellipse } from "./ellipse";
import { person, robot } from "./figure";
import { component, folder } from "./folder";
import { mobileDeviceLandscape, mobileDevicePortrait } from "./mobile";
import {
    finish,
    type ShapeBuilder,
    type SizeRule,
    squareFromWidth,
} from "./outline";
import { diamond, hexagon, regularHexagon } from "./polygon";
import type { Shape, ShapeGeometry } from "./types";
import { shell, terminal, webBrowser, window } from "./window";

/**
 * What a registry entry holds: how the shape is drawn and, when upstream
 * derives the box from the width whatever the style says, that rule.
 */
type ShapeEntry = { build: ShapeBuilder; size?: SizeRule };

/** Every shape's module, in spec order. */
const SHAPE_REGISTRY: Record<Shape, ShapeEntry> = {
    Box: { build: box },
    RoundedBox: { build: roundedBox },
    Circle: { build: circle, size: squareFromWidth },
    Ellipse: { build: ellipse },
    Hexagon: { build: hexagon, size: regularHexagon },
    Diamond: { build: diamond, size: squareFromWidth },
    Cylinder: { build: cylinder },
    Bucket: { build: bucket },
    Pipe: { build: pipe },
    Person: { build: person, size: squareFromWidth },
    Robot: { build: robot, size: squareFromWidth },
    Folder: { build: folder },
    WebBrowser: { build: webBrowser },
    Window: { build: window },
    MobileDevicePortrait: { build: mobileDevicePortrait },
    MobileDeviceLandscape: { build: mobileDeviceLandscape },
    Component: { build: component },
    Shell: { build: shell },
    Terminal: { build: terminal },
};

/** Every shape name, in spec order. */
export const SHAPES = Object.keys(SHAPE_REGISTRY) as readonly Shape[];

/** Whether a style's `shape` names one of the 19; anything else draws as a Box. */
export function isShape(name: string): name is Shape {
    return Object.hasOwn(SHAPE_REGISTRY, name);
}

/**
 * The geometry of `shape` drawn to fill a `width` × `height` box. An unknown
 * name draws as a Box, as upstream does. `strokeWidth` only moves the panel
 * of WebBrowser, Window and Terminal, which upstream insets by it.
 */
export function shapeGeometry(
    shape: string,
    width: number,
    height: number,
    strokeWidth = 2,
): ShapeGeometry {
    const name = isShape(shape) ? shape : "Box";
    return finish(
        name,
        width,
        height,
        SHAPE_REGISTRY[name].build(width, height, strokeWidth),
    );
}

/**
 * The box a shape is drawn in: the style's, unless the shape's registry entry
 * has a size rule. Upstream derives the height from the width for Circle,
 * Diamond, Person and Robot (square) and Hexagon (regular), whatever the
 * style says, and stored layouts were made against that box. This is an
 * exception to spec 9.1's "exactly its style's width × height", kept for
 * parity with Structurizr.
 */
export function shapeSize(
    shape: string,
    width: number,
    height: number,
): { width: number; height: number } {
    const size = isShape(shape) ? SHAPE_REGISTRY[shape].size : undefined;
    return size ? size(width, height) : { width, height };
}
