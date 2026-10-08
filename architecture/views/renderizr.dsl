systemContext Renderizr "Renderizr" {
    description "Static Architecture Page Generator. ${AUTHOR}" 
    include *
    autoLayout tb
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
