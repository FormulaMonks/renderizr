workspace "Structurizr Cooper" {
    description "Render static versions of Structurizr Diagrams"

    !adrs decisions
    !docs docs

    model {
        # Constants

        !include systems
        !include environments

        # Relationships
        !include relationships/_system.dsl
    }

    views {
        themes "https://static.structurizr.com/themes/default/theme.json"
        !const AUTHOR "Author: Andrés Zorro <andres.zorro@formula.co>"

        !include views
    }
}
