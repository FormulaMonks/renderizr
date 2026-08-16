import "../vendor/structurizr/css/structurizr.css";
import * as joint from "@joint/core";
import { DirectedGraph } from "@joint/layout-directed-graph";
import $ from "jquery";

/*
 * The renderer reaches for a handful of globals rather than importing them.
 * Rather than shipping the whole library each global came from, every one is
 * satisfied as narrowly as the renderer actually uses it.
 */

// structurizr-diagram.js calls exactly two lodash functions.
const each = <T>(collection: T[], iteratee: (value: T) => void) => {
    for (const value of collection) iteratee(value);
    return collection;
};

const filter = <T>(collection: T[], predicate: (value: T) => boolean) =>
    collection.filter(predicate);

// structurizr-util.js uses crypto-js for base64 alone, which the platform has.
const CryptoJS = {
    enc: {
        Utf8: {
            parse: (text: string) => text,
            stringify: (text: string) => decodeURIComponent(escape(text)),
        },
        Base64: {
            parse: (encoded: string) => window.atob(encoded),
            stringify: (text: string) =>
                window.btoa(unescape(encodeURIComponent(text))),
        },
    },
};

declare global {
    interface Window {
        $: typeof $;
        jQuery: typeof $;
        _: { each: typeof each; filter: typeof filter };
        joint: typeof runtime;
        V: typeof joint.V;
        g: typeof joint.g;
        CryptoJS: typeof CryptoJS;
        structurizr: typeof structurizr;
    }
}

/*
 * jointjs registers every shape passed to `Element.define` into the global
 * `joint.shapes`, and Structurizr defines nine of its own. Imported as ES
 * modules both `joint` and `joint.shapes` are module namespace objects, which
 * are frozen — so the registration throws and no shape is ever defined. The
 * distributed build Structurizr uses is a UMD bundle where they are ordinary
 * objects; these copies restore that.
 */
const runtime = {
    ...joint,
    shapes: { ...joint.shapes },
    layout: { ...joint.layout, DirectedGraph },
};

window.$ = window.jQuery = $;
window.joint = runtime;
window.V = joint.V;
window.g = joint.g;
window._ = { each, filter };
window.CryptoJS = CryptoJS;
