/**
 * `src/engine/geometry/label.ts` and `paint.ts`: how an element's label fits
 * its content area and how its outline is painted (spec 9.1 to 9.4). The
 * island renders what these return; Chrome exercises that in
 * `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    breakLines,
    fitLabel,
    iconPositionOf,
    labelText,
    LINE_HEIGHT,
    textWidth,
} = await importSrc("engine/geometry/label");
const { borderDashes, paintPart } = await importSrc("engine/geometry/paint");
const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");

/* ---------------- text */

test("a real newline and the literal \\n both break lines", () => {
    const cases = [
        ["One\\nTwo", "One\nTwo"],
        ["One\nTwo", "One\nTwo"],
        ["A\\nB\\nC", "A\nB\nC"],
        ["No break", "No break"],
    ];
    for (const [text, expected] of cases) {
        assert.equal(breakLines(text), expected, `breakLines(${text})`);
    }
});

test("the full label text breaks the name and description but never the metadata", () => {
    assert.equal(
        labelText("API\\nGateway", "[Container: a\\nb]", "Routes\\nrequests"),
        "API\nGateway\n[Container: a\\nb]\nRoutes\nrequests",
    );
    assert.equal(labelText("Name", "", ""), "Name", "empty parts are dropped");
});

/* ---------------- icon position */

test("iconPosition is Top, Bottom or Left, and anything else is Bottom", () => {
    const cases = [
        ["Top", "Top"],
        ["Bottom", "Bottom"],
        ["Left", "Left"],
        ["Right", "Bottom"],
        ["", "Bottom"],
    ];
    for (const [value, expected] of cases) {
        assert.equal(
            iconPositionOf(value),
            expected,
            `iconPositionOf(${value})`,
        );
    }
});

test("the text column is the content width less 30 each side, and 75 more beside a Left icon", () => {
    const cases = [
        [450, "Bottom", true, 390],
        [450, "Top", true, 390],
        [450, "Left", true, 315],
        [450, "Left", false, 390],
        [40, "Bottom", false, 0],
    ];
    for (const [width, position, icon, expected] of cases) {
        assert.equal(
            textWidth(width, position, icon),
            expected,
            `${width} wide, ${position} icon ${icon}`,
        );
    }
});

/* ---------------- fitting */

// At fontSize 24 a description line is 28.8 high, a name line 40.32 and a
// metadata line 20.16.
const LINE = 24 * LINE_HEIGHT;
const NAME = 24 * 1.4 * LINE_HEIGHT;
const META = 24 * 0.7 * LINE_HEIGHT;

const fit = (overrides) =>
    fitLabel({
        height: 300,
        fontSize: 24,
        iconPosition: "Bottom",
        icon: false,
        name: NAME,
        metadata: META,
        description: true,
        ...overrides,
    });

test("the description gets every whole line left after the fixed parts and gaps", () => {
    // 300 - name - 8 - metadata - 15 = 216.52, which holds 7 lines.
    const cases = [
        [{}, 7],
        // Without metadata its line and its gap are free: 300 - 40.32 - 15.
        [{ metadata: undefined }, 8],
        // A Bottom icon costs 15 + 60, a Top one 60 + 10.
        [{ icon: true, iconPosition: "Bottom" }, 4],
        [{ icon: true, iconPosition: "Top" }, 5],
        // A Left icon sits beside the text, so it costs no height.
        [{ icon: true, iconPosition: "Left" }, 7],
        [{ description: false }, 0],
        [{ height: NAME + 8 + META + 15 + LINE }, 1],
        [{ height: NAME + 8 + META + 15 + LINE - 0.5 }, 0],
    ];
    for (const [overrides, lines] of cases) {
        const result = fit(overrides);
        assert.equal(
            result.descriptionLines,
            lines,
            `${JSON.stringify(overrides)} fits ${lines} lines`,
        );
        assert.equal(result.overflows, false);
    }
});

test("when the fixed parts overflow, the icon is dropped first", () => {
    // Name and metadata take 68.48; a Top icon adds 70.
    const result = fit({ height: 100, icon: true, iconPosition: "Top" });

    assert.equal(result.icon, false, "the icon should go");
    assert.equal(result.overflows, false, "name and metadata fit alone");
    assert.equal(result.descriptionLines, 0);
});

test("a Left icon taller than the content area is dropped", () => {
    assert.equal(
        fit({ height: 50, icon: true, iconPosition: "Left" }).icon,
        false,
    );
    assert.equal(
        fit({ height: 80, icon: true, iconPosition: "Left" }).icon,
        true,
    );
});

test("an icon that fits is kept", () => {
    assert.equal(fit({ icon: true }).icon, true);
});

test("name and metadata that still overflow without the icon are reported", () => {
    const result = fit({ height: 60, icon: true });

    assert.equal(result.icon, false);
    assert.equal(result.overflows, true);
    assert.equal(result.descriptionLines, 0);
    assert.equal(fit({ height: 60 }).overflows, true);
});

/* ---------------- paint */

test("Dashed is a dash and gap of 4× the stroke width, Dotted 1×, Solid none", () => {
    const cases = [
        ["Dashed", 2, "8 8"],
        ["Dashed", 3, "12 12"],
        ["Dotted", 2, "2 2"],
        ["Dotted", 5, "5 5"],
        ["Solid", 2, undefined],
        ["Unknown", 2, undefined],
    ];
    for (const [border, width, expected] of cases) {
        assert.equal(
            borderDashes(border, width),
            expected,
            `${border} at ${width}`,
        );
    }
});

test("each paint role takes its fill, stroke and dashes from the style", () => {
    const style = {
        background: "#1168bd",
        stroke: "#0b4884",
        strokeWidth: 3,
        border: "Dashed",
    };
    const cases = [
        ["body", "#1168bd", "#0b4884", 3, "12 12"],
        ["frame", "#0b4884", "#0b4884", 3, "12 12"],
        ["screen", "#1168bd", "none", 0, undefined],
        ["ink", "#0b4884", "none", 0, undefined],
        ["rule", "none", "#0b4884", 1, "12 12"],
        ["grille", "none", "#1168bd", 2, undefined],
    ];
    for (const [paint, fill, stroke, strokeWidth, dashes] of cases) {
        assert.deepEqual(
            paintPart(paint, style),
            { fill, stroke, strokeWidth, strokeDasharray: dashes },
            `a ${paint} part`,
        );
    }
});

test("a Dashed or Dotted border dashes the frame of every framed shape", () => {
    const framed = [
        "WebBrowser",
        "Window",
        "Terminal",
        "MobileDevicePortrait",
        "MobileDeviceLandscape",
    ];
    const cases = [
        ["Dashed", "8 8"],
        ["Dotted", "2 2"],
        ["Solid", undefined],
    ];
    for (const shape of framed) {
        const frames = shapeGeometry(shape, 450, 300).parts.filter(
            (part) => part.paint === "frame",
        );
        assert.ok(frames.length > 0, `${shape} should have a frame`);
        for (const [border, dashes] of cases) {
            const style = {
                background: "#ffffff",
                stroke: "#000000",
                strokeWidth: 2,
                border,
            };
            for (const frame of frames) {
                assert.equal(
                    paintPart(frame.paint, style).strokeDasharray,
                    dashes,
                    `a ${border} ${shape} frame`,
                );
            }
        }
    }
});
