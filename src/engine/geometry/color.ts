/**
 * Colors as every SVG reader takes them. Mermaid's theme math writes colors
 * such as `hsl(212.9411764706, 100%, 95%)`, and resvg draws an `hsl()` with
 * a fractional hue as black, so the export writes hex or `rgba()` instead.
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
 * `value` with every `hsl()` in it written as hex, or as `rgba()` when it
 * is translucent. Everything else in `value` stays as it is.
 */
export const rgbColors = (value: string) =>
    value.replace(HSL, (_, hue, unit, s, l, alpha, percent) => {
        const rgb = hslToRgb(
            Number(hue) * DEGREES[(unit ?? "deg").toLowerCase()],
            Math.min(1, Number(s) / 100),
            Math.min(1, Number(l) / 100),
        );
        const a =
            alpha === undefined
                ? 1
                : Math.min(1, Number(alpha) / (percent ? 100 : 1));
        return a < 1 ? `rgba(${rgb.join(", ")}, ${a})` : toHex(rgb);
    });
