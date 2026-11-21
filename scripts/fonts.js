/**
 * The static faces resvg reads, made from the woff2 faces Google Fonts
 * serves, and the ascent and descent the text sits on (spec #364, _Fonts_).
 * wawoff2 decompresses a woff2 to TTF; harfbuzzjs's `hb-subset` pins a
 * variable face's `wght` axis at one weight. Both load on first use, so a
 * build without a font never loads them.
 */

/**
 * The weight CSS draws `normal` text at: the face the text's ascent and
 * descent come from, and the one a regular line measures in.
 */
export const REGULAR = 400;

/** The weight CSS draws `bold` text at. */
export const BOLD = 700;

/** A four-letter table or axis tag as the number harfbuzz takes. */
const tag = (text) =>
    ((text.charCodeAt(0) << 24) |
        (text.charCodeAt(1) << 16) |
        (text.charCodeAt(2) << 8) |
        text.charCodeAt(3)) >>>
    0;

/** What an error calls a face the caller gave no name for. */
const UNNAMED = "the face";

/**
 * The tables of the TTF or OTF in `bytes`, by tag, as views on its bytes.
 * Throws on bytes that hold no font, naming the face `name`.
 */
function tables(bytes, name = UNNAMED) {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const version = data.getUint32(0);
    if (version !== 0x00010000 && version !== tag("OTTO")) {
        throw new Error(`${name} is not a TrueType or OpenType font`);
    }
    const found = new Map();
    const count = data.getUint16(4);
    for (let at = 12; at < 12 + count * 16; at += 16) {
        const table = String.fromCharCode(
            ...bytes.subarray(at, at + 4).values(),
        );
        const offset = data.getUint32(at + 8);
        const length = data.getUint32(at + 12);
        found.set(
            table,
            new DataView(bytes.buffer, bytes.byteOffset + offset, length),
        );
    }
    return found;
}

/**
 * Whether the face in `ttf` varies its weight along a `wght` axis. `name`
 * says which face in an error.
 */
export function isVariable(ttf, name = UNNAMED) {
    const fvar = tables(ttf, name).get("fvar");
    if (!fvar) return false;
    const axesAt = fvar.getUint16(4);
    const count = fvar.getUint16(8);
    const size = fvar.getUint16(10);
    for (let axis = 0; axis < count; axis += 1) {
        if (fvar.getUint32(axesAt + axis * size) === tag("wght")) return true;
    }
    return false;
}

/**
 * The face's ascent and descent from its `hhea` table, as multiples of the
 * font size, unrounded: what the page and the CLI set text on. `name` says
 * which face in an error.
 */
export function hheaMetrics(ttf, name = UNNAMED) {
    const faceTables = tables(ttf, name);
    const head = faceTables.get("head");
    const hhea = faceTables.get("hhea");
    if (!head || !hhea) throw new Error(`${name} has no head or hhea table`);
    const unitsPerEm = head.getUint16(18);
    return {
        ascent: hhea.getInt16(4) / unitsPerEm,
        // hhea stores the descent below the baseline as negative.
        descent: -hhea.getInt16(6) / unitsPerEm || 0,
    };
}

/** wawoff2's decompressor, loaded once, without its compressor. */
let decompress;

/** The decompression running last, which the next one waits for. */
let queue = Promise.resolve();

/**
 * The TTF the woff2 in `woff2` compresses. One decompression runs at a
 * time: wawoff2 shares one wasm module, and two calls at once can hand
 * back each other's bytes.
 */
export function decompressWoff2(woff2) {
    decompress ??= import("wawoff2/decompress.js").then(
        (module) => module.default,
    );
    const run = queue.then(async () =>
        Buffer.from(await (await decompress)(woff2)),
    );
    queue = run.catch(() => {});
    return run;
}

/** harfbuzzjs's subsetter, instantiated once. */
let harfbuzz;

async function subsetter() {
    harfbuzz ??= (async () => {
        const { readFile } = await import("node:fs/promises");
        const wasm = await readFile(
            new URL(
                import.meta.resolve("harfbuzzjs/dist/harfbuzz-subset.wasm"),
            ),
        );
        const { instance } = await WebAssembly.instantiate(wasm);
        instance.exports._initialize?.();
        return instance.exports;
    })();
    return harfbuzz;
}

/** harfbuzz's mode for a blob it may write to. */
const WRITABLE = 2;

/**
 * The variable face in `ttf` pinned at `weight` on its `wght` axis: a static
 * TTF with every glyph and table kept. Throws when harfbuzz cannot pin it,
 * naming the face `name` and the weight.
 */
export async function pinWeight(ttf, weight, name = UNNAMED) {
    const hb = await subsetter();
    const at = hb.malloc(ttf.length);
    new Uint8Array(hb.memory.buffer).set(ttf, at);
    const blob = hb.hb_blob_create(at, ttf.length, WRITABLE, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    const input = hb.hb_subset_input_create_or_fail();
    try {
        hb.hb_subset_input_keep_everything(input);
        if (
            !hb.hb_subset_input_pin_axis_location(
                input,
                face,
                tag("wght"),
                weight,
            )
        ) {
            throw new Error(
                `harfbuzz could not pin the wght axis of ${name} at weight ${weight}`,
            );
        }
        const pinned = hb.hb_subset_or_fail(face, input);
        if (!pinned)
            throw new Error(
                `harfbuzz could not instance ${name} at weight ${weight}`,
            );
        const out = hb.hb_face_reference_blob(pinned);
        const data = hb.hb_blob_get_data(out, 0);
        const length = hb.hb_blob_get_length(out);
        // Copied out before the memory it sits in is freed.
        const bytes = Buffer.from(
            new Uint8Array(hb.memory.buffer, data, length),
        );
        hb.hb_blob_destroy(out);
        hb.hb_face_destroy(pinned);
        return bytes;
    } finally {
        hb.hb_subset_input_destroy(input);
        hb.hb_face_destroy(face);
        hb.hb_blob_destroy(blob);
        hb.free(at);
    }
}
