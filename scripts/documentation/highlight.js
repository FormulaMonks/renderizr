import hljs from "highlight.js";
import structurizr from "./structurizr.js";

/**
 * The highlight.js the build highlights fenced code with: every language
 * highlight.js knows, with their aliases, plus Structurizr DSL as
 * `structurizr`, on an instance of its own. The page carries no grammar.
 *
 * No highlight.js stylesheet ships: every theme is hardcoded to one color
 * scheme, so the `hljs-*` token colors live in
 * `src/components/markdown-renderer.module.css`, where they follow
 * `data-theme`, one palette for every language.
 */
export const highlighter = hljs.newInstance();

for (const name of hljs.listLanguages()) {
    const language = hljs.getLanguage(name);
    if (language?.rawDefinition) {
        highlighter.registerLanguage(name, language.rawDefinition);
    }
}
highlighter.registerLanguage("structurizr", structurizr);

/**
 * `code` highlighted as `language`, or `""` for markdown-it to escape it
 * itself: a fence with no language, or one the highlighter does not know,
 * stays plain, with no guessing.
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
