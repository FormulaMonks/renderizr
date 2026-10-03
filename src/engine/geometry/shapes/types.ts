/**
 * The data a shape's geometry is made of (spec 9.4). Coordinates are local to
 * the element: (0, 0) is its top-left, y grows downward. Everything here is
 * plain JSON, so a geometry can be compared in a test or serialized into the
 * engine report as it is.
 */

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

export type Side = "top" | "right" | "bottom" | "left";

/**
 * Where edge ends may sit on one side of the bounding box, as an interval of
 * the side's own axis: x for top and bottom, y for left and right.
 */
export type Span = { from: number; to: number };

/** The 19 Structurizr shapes (spec 9.4). */
export type Shape =
    | "Box"
    | "RoundedBox"
    | "Circle"
    | "Ellipse"
    | "Hexagon"
    | "Diamond"
    | "Cylinder"
    | "Bucket"
    | "Pipe"
    | "Person"
    | "Robot"
    | "Folder"
    | "WebBrowser"
    | "Window"
    | "MobileDevicePortrait"
    | "MobileDeviceLandscape"
    | "Component"
    | "Shell"
    | "Terminal";

/**
 * One straight or elliptical piece of a silhouette. An arc's angles are the
 * ellipse's parametric angles in radians, y down, so the arc's points are
 * `center + (rx·cos θ, ry·sin θ)` for θ from `start` up to `end`. Increasing
 * θ runs clockwise on screen, which is the direction every outline is walked.
 */
export type Segment =
    | { kind: "line"; from: Point; to: Point }
    | {
          kind: "arc";
          center: Point;
          rx: number;
          ry: number;
          start: number;
          end: number;
      };

/**
 * How a drawn part is painted, named after what it takes from the style:
 * - body: fill background, stroke stroke at strokeWidth, border dashes
 * - frame: fill stroke, stroke stroke (device and window bezels)
 * - screen: fill background, no stroke (panels, displays, buttons, URL bar)
 * - ink: fill stroke, no stroke (the `>_` prompt)
 * - rule: no fill, stroke stroke at width 1, border dashes (Person and Robot
 *   arms)
 * - grille: no fill, stroke background at width 2 (mobile speaker)
 */
export type Paint = "body" | "frame" | "screen" | "ink" | "rule" | "grille";

/** One SVG `<path>` to draw. */
export type ShapePart = { d: string; paint: Paint };

export type ShapeGeometry = {
    shape: Shape;
    width: number;
    height: number;
    /** Everything drawn, back to front: outline pieces and decorations. */
    parts: ShapePart[];
    /** The silhouette as one closed path: the focus ring and hit area. */
    outline: string;
    /** The silhouette as segments, walked clockwise, for the ray math. */
    segments: Segment[];
    /**
     * The rect the label template fills. The template adds its 30 side
     * padding inside it (spec 9.2).
     */
    content: Rect;
    /** The usable stretch of each side for edge ends (spec 10.4). */
    spans: Record<Side, Span>;
};
