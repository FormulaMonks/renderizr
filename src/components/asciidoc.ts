/**
 * A small AsciiDoc-to-Markdown pass for documentation sections written as
 * `.adoc`. Feeding those straight to the Markdown parser turns the whole file
 * into one bold wall of `:toc: macro` and `|===`, which is worse than useless.
 *
 * This covers the constructs that actually appear in architecture
 * documentation — headings, lists, code and literal blocks, admonitions,
 * tables, images, quotes. It is not a conformant AsciiDoc processor, and
 * anything it does not recognize passes through as plain text rather than
 * being mangled.
 */

const ADMONITIONS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];

export function asciidocToMarkdown(source: string): string {
    const out: string[] = [];
    const lines = source.replace(/\r\n/g, "\n").split("\n");

    let inDelimited: string | null = null;
    let pendingLanguage = "";
    let inTable = false;
    let tableRow: string[] = [];
    let tableHeaderWritten = false;

    const flushTableRow = () => {
        if (!tableRow.length) return;
        out.push(`| ${tableRow.join(" | ")} |`);
        if (!tableHeaderWritten) {
            out.push(`|${tableRow.map(() => " --- ").join("|")}|`);
            tableHeaderWritten = true;
        }
        tableRow = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Delimited blocks: ---- listing, .... literal, ==== example, **** sidebar
        const delimiter = line.match(/^(-{4,}|\.{4,}|={4,}|\*{4,}|_{4,})\s*$/);
        if (delimiter) {
            const kind = delimiter[1][0];
            if (inDelimited === kind) {
                inDelimited = null;
                out.push("```");
            } else if (!inDelimited) {
                inDelimited = kind;
                out.push(`\`\`\`${pendingLanguage}`);
                pendingLanguage = "";
            } else {
                out.push(line);
            }
            continue;
        }

        if (inDelimited) {
            out.push(line);
            continue;
        }

        // Table boundaries and rows
        if (/^\|===/.test(line)) {
            flushTableRow();
            inTable = !inTable;
            if (!inTable) tableHeaderWritten = false;
            out.push("");
            continue;
        }

        if (inTable) {
            if (!line.trim()) {
                flushTableRow();
                continue;
            }
            tableRow.push(
                ...line
                    .split("|")
                    .slice(1)
                    .map((cell) => cell.trim()),
            );
            continue;
        }

        // Document attributes and the table-of-contents macro carry no content
        if (/^:[\w!-]+:/.test(line) || /^toc::\[\]/.test(line)) continue;

        // Block attribute lines: [source,json], [NOTE], [quote, who, where]
        const attribute = line.match(/^\[([^\]]*)\]\s*$/);
        if (attribute) {
            const [first, ...rest] = attribute[1]
                .split(",")
                .map((part) => part.trim());

            if (/^source$/i.test(first)) {
                pendingLanguage = rest[0] ?? "";
            } else if (ADMONITIONS.includes(first.toUpperCase())) {
                out.push(`> **${first.toUpperCase()}**`, ">");
            } else if (/^quote$/i.test(first)) {
                out.push(`> *${rest.filter(Boolean).join(", ")}*`, ">");
            } else if (first && !/^\w+$/.test(first)) {
                pendingLanguage = "";
            }
            continue;
        }

        // Inline admonition: NOTE: something
        const inline = line.match(/^(\w+):\s+(.*)$/);
        if (inline && ADMONITIONS.includes(inline[1])) {
            out.push(`> **${inline[1]}** ${inline[2]}`);
            continue;
        }

        // Headings — AsciiDoc's document title `=` is Markdown's `#`
        const heading = line.match(/^(={1,6})\s+(.*)$/);
        if (heading) {
            out.push(`${"#".repeat(heading[1].length)} ${heading[2]}`);
            continue;
        }

        // Block image / embedded diagram
        const image = line.match(/^image::([^[]+)\[([^\]]*)\]/);
        if (image) {
            const alt = image[2].split(",")[0].replace(/^["']|["']$/g, "");
            out.push(`![${alt}](${image[1].trim()})`);
            continue;
        }

        out.push(
            line
                // Unordered and ordered list markers are already Markdown-ish,
                // but AsciiDoc nests by repeating the marker.
                .replace(
                    /^(\*{2,})\s+/,
                    (_, stars: string) => `${"  ".repeat(stars.length - 1)}* `,
                )
                .replace(
                    /^(\.{2,})\s+/,
                    (_, dots: string) => `${"  ".repeat(dots.length - 1)}1. `,
                )
                .replace(/^\.\s+/, "1. ")
                // Inline monospace and bold use the same glyphs as Markdown,
                // except for the doubled forms.
                .replace(/`\+([^+]+)\+`/g, "`$1`")
                .replace(/\{([\w-]+)\}/g, "$1"),
        );
    }

    flushTableRow();

    return out.join("\n");
}

export const isAsciiDoc = (filename = "") => /\.adoc$/i.test(filename);
