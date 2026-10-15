// Mermaid's "base" theme on its own: the code that derives the whole palette from themeVariables.primaryColor.
import { getThemeVariables } from "../../mermaid-src/repo/packages/mermaid/src/themes/theme-base.js";

export const palette = (overrides) => getThemeVariables(overrides);
