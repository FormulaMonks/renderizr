/**
 * What a view is called, Structurizr's way: its own title, else a name made
 * from its type and its subject ("Container View: Internet Banking"). Plain
 * JavaScript, so the page's `WorkspaceModel` and the build's diagram cards
 * (`scripts/documentation/embeds.js`) run this one copy; `view-titles.d.ts`
 * types it for the page.
 *
 * Each caller looks elements and views up its own way, so both rules take
 * the lookups beside the view.
 */

/**
 * @typedef {object} TitledView
 * @property {string} key
 * @property {string} type The view's type, as `WorkspaceModel` names it.
 * @property {string} [title]
 * @property {string} [name]
 * @property {string} [softwareSystemId]
 * @property {string} [containerId]
 * @property {string} [elementId]
 * @property {string} [environment]
 * @property {string} [baseViewKey]
 * @property {{ title?: string } | object} [mermaid]
 *
 * @typedef {object} TitleLookups
 * @property {(id: string | undefined) => { name?: string, type?: string, parentId?: string } | undefined} element
 * @property {(key: string | undefined) => TitledView | undefined} view
 * @property {{ name: string } | undefined} [enterprise]
 */

/**
 * A view's own title, else a Mermaid diagram's frontmatter title, else its
 * name, else one made from its type.
 *
 * @param {TitledView} view
 * @param {TitleLookups} lookups
 * @returns {string}
 */
export function viewTitle(view, lookups) {
    if (view.title?.trim()) return view.title;
    const diagram = view.type === "Mermaid" ? view.mermaid : undefined;
    if (diagram && "title" in diagram && diagram.title?.trim())
        return diagram.title;
    if (view.type === "Filtered") {
        const base = lookups.view(view.baseViewKey);
        return base ? viewTitle(base, lookups) : "";
    }
    if (view.name?.trim()) return view.name;
    return defaultViewName(view, lookups);
}

/**
 * The name Structurizr makes for a view from its type and its subject.
 *
 * @param {TitledView} given
 * @param {TitleLookups} lookups
 * @returns {string}
 */
export function defaultViewName(given, lookups) {
    const view =
        given.type === "Filtered" ? lookups.view(given.baseViewKey) : given;
    if (!view) return "";
    // A name may break its label with `\n`; a title keeps to one line.
    const oneLine = (text) => (text ?? "").replace(/\\n/g, " ");
    const name = (id) => oneLine(lookups.element(id)?.name);

    switch (view.type) {
        case "Custom":
            return `Custom View: ${view.title?.trim() ? view.title : "Untitled"}`;
        case "SystemLandscape": {
            const enterprise = lookups.enterprise;
            return `System Landscape View${enterprise ? `: ${enterprise.name}` : ""}`;
        }
        case "SystemContext":
            return `System Context View: ${name(view.softwareSystemId)}`;
        case "Container":
            return `Container View: ${name(view.softwareSystemId)}`;
        case "Component": {
            const container = lookups.element(view.containerId);
            return `Component View: ${name(container?.parentId)} - ${oneLine(container?.name)}`;
        }
        case "Dynamic": {
            const element =
                lookups.element(view.elementId) ??
                lookups.element(view.softwareSystemId);
            if (!element) return "Dynamic View";
            if (element.type === "SoftwareSystem") {
                return `Dynamic View: ${oneLine(element.name)}`;
            }
            if (element.type === "Container") {
                return `Dynamic View: ${name(element.parentId)} - ${oneLine(element.name)}`;
            }
            return "";
        }
        case "Deployment":
            return view.softwareSystemId
                ? `Deployment View: ${name(view.softwareSystemId)} - ${view.environment}`
                : `Deployment View: ${view.environment}`;
        case "Image":
        case "Mermaid":
            return `Image View: ${view.key}`;
        default:
            return "";
    }
}
