// `highlight.js/lib/common` registers 34 languages. These are the ones that
// actually turn up in architecture documentation; a later ticket registers
// every language highlight.js knows.
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * The highlight.js the build highlights fenced code with. No highlight.js
 * stylesheet ships: every theme is hardcoded to one color scheme, so the
 * `hljs-*` token colors live in `src/components/markdown-renderer.module.css`,
 * where they follow `data-theme`.
 */
export const highlighter = hljs.newInstance();

for (const [name, language] of Object.entries({
    bash,
    css,
    java,
    javascript,
    json,
    markdown,
    python,
    sql,
    typescript,
    xml,
    yaml,
})) {
    highlighter.registerLanguage(name, language);
}

/**
 * `code` highlighted as `language`, or `""` for markdown-it to escape it
 * itself: a fence with no language, or one the highlighter does not know,
 * stays plain.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string}
 */
export function highlight(code, language) {
    if (language && highlighter.getLanguage(language)) {
        try {
            return highlighter.highlight(code, { language }).value;
        } catch {}
    }
    return "";
}
