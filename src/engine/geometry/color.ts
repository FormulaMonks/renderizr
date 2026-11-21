/**
 * Colors as every SVG reader takes them. Mermaid's theme math writes colors
 * such as `hsl(212.9411764706, 100%, 95%)`, and resvg draws an `hsl()` with
 * a fractional hue as black, so the export writes hex or `rgba()` instead.
 * resvg draws other colors it cannot read black too: `rgb()` in the space
 * syntax, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()` and
 * `rebeccapurple`, which a branding primary color or a Mermaid style can
 * carry. The export writes those as hex or `rgba()` as well.
 */

/** A color's red, green and blue channels, each 0 to 255. */
export type Rgb = [number, number, number];

/** One `hsl()` or `hsla()` color, in its comma or space syntax. */
const HSL =
    /hsla?\(\s*([+-]?[\d.]+(?:e[+-]?\d+)?)(deg|grad|rad|turn)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)/gi;

/** How many degrees one of each hue unit turns. */
const DEGREES: Record<string, number> = {
    deg: 1,
    grad: 0.9,
    rad: 180 / Math.PI,
    turn: 360,
};

/**
 * The channels of the color at `hue` degrees, `saturation` and `lightness`
 * from 0 to 1, rounded as a browser rounds them. Any hue turns into 0 to 360.
 */
export function hslToRgb(hue: number, saturation: number, lightness: number) {
    const h = (((hue % 360) + 360) % 360) / 360;
    const q =
        lightness < 0.5
            ? lightness * (1 + saturation)
            : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    const channel = (t: number) => {
        const k = (t + 1) % 1;
        const v =
            k < 1 / 6
                ? p + (q - p) * 6 * k
                : k < 1 / 2
                  ? q
                  : k < 2 / 3
                    ? p + (q - p) * (2 / 3 - k) * 6
                    : p;
        // Rounded twice so float error can't tip a half channel down.
        return Math.round(Math.round(v * 255 * 1e6) / 1e6);
    };
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)] as Rgb;
}

/** `rgb` as `#rrggbb`, each channel clamped to 0 to 255. */
export const toHex = (rgb: Rgb) =>
    `#${rgb
        .map((c) =>
            Math.round(Math.min(255, Math.max(0, c)))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;

/**
 * `value` with every `hsl()`, and every color resvg cannot read, written as
 * hex, or as `rgba()` when it is translucent. Everything else in `value`,
 * the legacy `rgb()` and `rgba()` included, stays as it is.
 */
export const rgbColors = (value: string) =>
    value
        .replace(HSL, (_, hue, unit, s, l, alpha, percent) => {
            const rgb = hslToRgb(
                Number(hue) * DEGREES[(unit ?? "deg").toLowerCase()],
                Math.min(1, Number(s) / 100),
                Math.min(1, Number(l) / 100),
            );
            const a =
                alpha === undefined
                    ? 1
                    : Math.min(1, Number(alpha) / (percent ? 100 : 1));
            return written(rgb, a);
        })
        .replace(COLOR_FUNCTION, (whole, name: string, body: string) => {
            const rgba = colorFunction(name.toLowerCase(), body);
            return rgba ? written(rgba.rgb, rgba.alpha) : whole;
        })
        .replace(REBECCA_PURPLE, "$1#663399");

/** `rgb` as hex, or as `rgba()` with commas when `alpha` is under 1. */
const written = (rgb: Rgb, alpha: number) =>
    alpha < 1
        ? `rgba(${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c)))).join(", ")}, ${Math.max(0, alpha)})`
        : toHex(rgb);

/* ---------------- colors resvg cannot read (it draws them black) */

/**
 * A color function resvg cannot read in some or all of its forms: `rgb()`
 * in the space syntax or with a percent alpha, and every CSS Color 4
 * function. The legacy `rgb(r, g, b)` and `rgba(r, g, b, a)` it reads stay.
 */
const COLOR_FUNCTION = /\b(rgba?|hwb|lab|lch|oklab|oklch|color)\(([^()]*)\)/gi;

/** The one CSS named color resvg does not know, standing alone in a value. */
const REBECCA_PURPLE = /(^|[\s:;,])rebeccapurple(?=$|[\s;,])/gi;

/** One component: a number, maybe with a percent sign or an angle unit. */
type Component = { value: number; unit: string };

const COMPONENT =
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i;

/** The components of a color function's body and its alpha, or null. */
function components(body: string) {
    const [main, alpha, extra] = body.split("/");
    if (extra !== undefined) return null;
    const parse = (token: string): Component | null => {
        if (token.toLowerCase() === "none") return { value: 0, unit: "" };
        const match = COMPONENT.exec(token);
        return match
            ? { value: Number(match[1]), unit: (match[2] ?? "").toLowerCase() }
            : null;
    };
    const tokens = main.trim().split(/\s*,\s*|\s+/);
    const parsed = tokens.map(parse);
    if (parsed.some((c) => !c)) return null;
    const commas = main.includes(",");
    let a: Component | null = { value: 1, unit: "" };
    if (alpha !== undefined) a = parse(alpha.trim());
    else if (commas && parsed.length === 4) a = parsed.pop() ?? null;
    if (!a) return null;
    return {
        list: parsed as Component[],
        alpha: Math.min(1, a.unit === "%" ? a.value / 100 : a.value),
        legacy: commas && alpha === undefined && a.unit !== "%",
    };
}

/** A component as a number, where a percent is `full` at 100%. */
const scaled = ({ value, unit }: Component, full: number) =>
    unit === "%" ? (value / 100) * full : value;

/** A hue component in degrees. */
const degrees = ({ value, unit }: Component) => value * (DEGREES[unit] ?? 1);

/** A linear-light channel, 0 to 1, as gamma-encoded sRGB, 0 to 255. */
const encoded = (linear: number) => {
    const abs = Math.abs(linear);
    const v =
        abs <= 0.0031308
            ? 12.92 * linear
            : Math.sign(linear) * (1.055 * abs ** (1 / 2.4) - 0.055);
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

/** Multiply the 3 by 3 matrix `m` by `v`. */
const times = (m: number[][], v: number[]) =>
    m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

/** CIE Lab (D50) to linear sRGB, through XYZ and a Bradford adaptation. */
function labToLinear(l: number, a: number, b: number) {
    const kappa = 24389 / 27;
    const epsilon = 216 / 24389;
    const fy = (l + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const inverse = (f: number) =>
        f ** 3 > epsilon ? f ** 3 : (116 * f - 16) / kappa;
    const xyz50 = [
        (inverse(fx) * 0.3457) / 0.3585,
        l > kappa * epsilon ? fy ** 3 : l / kappa,
        (inverse(fz) * (1 - 0.3457 - 0.3585)) / 0.3585,
    ];
    const xyz65 = times(
        [
            [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
            [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
            [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
        ],
        xyz50,
    );
    return times(
        [
            [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
            [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
            [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
        ],
        xyz65,
    );
}

/** OKLab to linear sRGB. */
function oklabToLinear(l: number, a: number, b: number) {
    const lms = times(
        [
            [1, 0.3963377774, 0.2158037573],
            [1, -0.1055613458, -0.0638541728],
            [1, -0.0894841775, -1.291485548],
        ],
        [l, a, b],
    ).map((c) => c ** 3);
    return times(
        [
            [4.0767416621, -3.3077115913, 0.2309699292],
            [-1.2684380046, 2.6097574011, -0.3413193965],
            [-0.0041960863, -0.7034186147, 1.707614701],
        ],
        lms,
    );
}

/** Polar `chroma` and `hue` as the two axes of a Lab-like space. */
const axes = (chroma: number, hue: number) => [
    chroma * Math.cos((hue * Math.PI) / 180),
    chroma * Math.sin((hue * Math.PI) / 180),
];

/**
 * The color function `name` with `body` as sRGB channels and an alpha, or
 * null when resvg reads it already or the body is not one this reads.
 * Colors outside sRGB clip to it, channel by channel.
 */
function colorFunction(
    name: string,
    body: string,
): { rgb: Rgb; alpha: number } | null {
    if (name === "color") {
        const [space, ...rest] = body.trim().split(/\s+/);
        const parsed = components(rest.join(" "));
        if (parsed?.list.length !== 3) return null;
        const values = parsed.list.map((c) => scaled(c, 1));
        if (space.toLowerCase() === "srgb")
            return {
                rgb: values.map((v) =>
                    Math.round(Math.min(1, Math.max(0, v)) * 255),
                ) as Rgb,
                alpha: parsed.alpha,
            };
        if (space.toLowerCase() === "srgb-linear")
            return { rgb: values.map(encoded) as Rgb, alpha: parsed.alpha };
        return null;
    }
    const parsed = components(body);
    if (parsed?.list.length !== 3) return null;
    const [x, y, z] = parsed.list;
    const { alpha } = parsed;
    switch (name) {
        case "rgb":
        case "rgba":
            if (parsed.legacy) return null;
            return {
                rgb: [x, y, z].map((c) =>
                    Math.round(Math.min(255, Math.max(0, scaled(c, 255)))),
                ) as Rgb,
                alpha,
            };
        case "hwb": {
            const white = scaled(w(y), 1);
            const black = scaled(w(z), 1);
            if (white + black >= 1) {
                const gray = Math.round((white / (white + black)) * 255);
                return { rgb: [gray, gray, gray], alpha };
            }
            const pure = hslToRgb(degrees(x), 1, 0.5);
            return {
                rgb: pure.map((c) =>
                    Math.round(((c / 255) * (1 - white - black) + white) * 255),
                ) as Rgb,
                alpha,
            };
        }
        case "lab":
            return {
                rgb: labToLinear(
                    scaled(x, 100),
                    scaled(y, 125),
                    scaled(z, 125),
                ).map(encoded) as Rgb,
                alpha,
            };
        case "lch": {
            const [a, b] = axes(scaled(y, 150), degrees(z));
            return {
                rgb: labToLinear(scaled(x, 100), a, b).map(encoded) as Rgb,
                alpha,
            };
        }
        case "oklab":
            return {
                rgb: oklabToLinear(
                    scaled(x, 1),
                    scaled(y, 0.4),
                    scaled(z, 0.4),
                ).map(encoded) as Rgb,
                alpha,
            };
        case "oklch": {
            const [a, b] = axes(scaled(y, 0.4), degrees(z));
            return {
                rgb: oklabToLinear(scaled(x, 1), a, b).map(encoded) as Rgb,
                alpha,
            };
        }
        default:
            return null;
    }
}

/** An `hwb()` whiteness or blackness, which is a percent or a bare 0 to 100. */
const w = (c: Component): Component =>
    c.unit === "%" ? c : { value: c.value, unit: "%" };
