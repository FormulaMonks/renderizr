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
import { finish, type ShapeBuilder } from "./outline";
import { diamond, hexagon } from "./polygon";
import type { Shape, ShapeGeometry } from "./types";
import { shell, terminal, webBrowser, window } from "./window";

/** Every shape's module, in spec order. */
const BUILDERS: Record<Shape, ShapeBuilder> = {
    Box: box,
    RoundedBox: roundedBox,
    Circle: circle,
    Ellipse: ellipse,
    Hexagon: hexagon,
    Diamond: diamond,
    Cylinder: cylinder,
    Bucket: bucket,
    Pipe: pipe,
    Person: person,
    Robot: robot,
    Folder: folder,
    WebBrowser: webBrowser,
    Window: window,
    MobileDevicePortrait: mobileDevicePortrait,
    MobileDeviceLandscape: mobileDeviceLandscape,
    Component: component,
    Shell: shell,
    Terminal: terminal,
};

/** Every shape name, in spec order. */
export const SHAPES = Object.keys(BUILDERS) as readonly Shape[];

/** Whether a style's `shape` names one of the 19; anything else draws as a Box. */
export const isShape = (name: string): name is Shape =>
    Object.hasOwn(BUILDERS, name);

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
        BUILDERS[name](width, height, strokeWidth),
    );
}

/**
 * The box a shape is drawn in. Upstream derives the height from the width for
 * Circle, Diamond, Person and Robot (square) and Hexagon (regular,
 * `floor(w·√3/2)` tall), whatever the style says, and stored layouts were
 * made against that box. This is an exception to spec 9.1's "exactly its
 * style's width × height", kept for parity with Structurizr.
 */
export function shapeSize(
    shape: string,
    width: number,
    height: number,
): { width: number; height: number } {
    switch (shape) {
        case "Circle":
        case "Diamond":
        case "Person":
        case "Robot":
            return { width, height: width };
        case "Hexagon":
            return { width, height: Math.floor((width * Math.sqrt(3)) / 2) };
        default:
            return { width, height };
    }
}
