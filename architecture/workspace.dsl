workspace "Renderizr" {
    description "Render static versions of Structurizr Diagrams"

    !adrs decisions
    !docs docs

    model {
        # Constants

        !include systems
        !include environments

        # Relationships
        !include relationships/_external.dsl
        !include relationships/_people.dsl
        !include relationships/_system.dsl
    }

    views {
        themes "https://formulamonks.github.io/scaffoldizr/assets/scaffoldizr-default.json" "https://formulamonks.github.io/scaffoldizr/assets/scaffoldizr-shapes.json" "https://formulamonks.github.io/scaffoldizr/assets/scaffoldizr-status.json"

        !const AUTHOR "Author: Andrés Zorro <andres.zorro@monks.com>"

        !include views

        styles {
            relationship "Relationship" {
                routing Orthogonal
                jump true
            }
        }
    }
}
