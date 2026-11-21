export const FIXTURES = process.env.ONLY
    ? process.env.ONLY.split(",")
    : [
          "export",
          "view-types",
          "perspectives",
          "animation",
          "mermaid-flowchart",
          "mermaid-erd",
          "mermaid-sequence",
      ];
export const FONTS = process.env.FONTS
    ? process.env.FONTS.split(",")
    : ["Arimo", "Inter"];
/** Fixtures also exported in dark. */
export const DARK = ["export", "mermaid-sequence"];
export const OUT = new URL("./out", import.meta.url).pathname;
