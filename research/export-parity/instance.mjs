// Instance a variable woff2 at a weight with hb-subset (harfbuzzjs) after wawoff2 decompresses it.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const wawoff2 = require("wawoff2");
const wasm = readFileSync(
    new URL(
        "./node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm",
        import.meta.url,
    ),
);
const { instance } = await WebAssembly.instantiate(wasm);
const hb = instance.exports;
const tag = (s) =>
    (s.charCodeAt(0) << 24) |
    (s.charCodeAt(1) << 16) |
    (s.charCodeAt(2) << 8) |
    s.charCodeAt(3);
export async function instanceAt(woff2, weight) {
    const ttf = await wawoff2.decompress(woff2);
    const ptr = hb.malloc(ttf.length);
    new Uint8Array(hb.memory.buffer).set(ttf, ptr);
    const blob = hb.hb_blob_create(ptr, ttf.length, 2 /*writable*/, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    const input = hb.hb_subset_input_create_or_fail();
    hb.hb_subset_input_keep_everything(input);
    if (!hb.hb_subset_input_pin_axis_location(input, face, tag("wght"), weight))
        throw new Error("pin failed");
    const out = hb.hb_subset_or_fail(face, input);
    if (!out) throw new Error("subset failed");
    const outBlob = hb.hb_face_reference_blob(out);
    const data = hb.hb_blob_get_data(outBlob, 0);
    const len = hb.hb_blob_get_length(outBlob);
    const bytes = Buffer.from(new Uint8Array(hb.memory.buffer, data, len));
    hb.hb_blob_destroy(outBlob);
    hb.hb_face_destroy(out);
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.hb_blob_destroy(blob);
    hb.free(ptr);
    return bytes;
}
