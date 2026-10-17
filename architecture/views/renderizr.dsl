systemContext Renderizr "Renderizr" {
    description "Static Architecture Page Generator. ${AUTHOR}" 
    include *
    autoLayout tb 300 300
}

container Renderizr {
    description "Renders diagrams, docs and ADRs. ${AUTHOR}" 
    include *
}

component CLI "CLI-Components" {
    title "Components: Command-Line Interface"
    description "Builds the static site, and serves edit mode. ${AUTHOR}"
    include *
}

component Site "Site-Components" {
    title "Components: Static Site"
    description "Shows a workspace, and arranges its views in edit mode. ${AUTHOR}"
    include *
}

image Renderizr "Image-View-Reading" {
    mermaid ../mermaid/image-view.mmd
    title "Flowchart: How the build reads an image view"
    description "Which image views draw as Mermaid diagrams, which fail, and which stay ordinary image views. ${AUTHOR}"
}

image Renderizr "Layout-Data" {
    mermaid ../mermaid/layout-data.mmd
    title "ERD: Layout data in workspace.json"
    description "What Structurizr stores for a view's layout, and what edit mode writes back (ADR 17). ${AUTHOR}"
}

image Renderizr "Edit-Mode-Save" {
    mermaid ../mermaid/edit-mode.mmd
    title "Sequence: How edit mode saves and redraws"
    description "A save from the page, and a change under the DSL's folder in a DSL session. ${AUTHOR}"
}
