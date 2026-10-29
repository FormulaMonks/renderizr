workspace extends landscape-workspace.dsl {

    name "Shipping"
    description "The software system scoped workspace for Shipping, which extends the landscape."

    model {
        !element shipping {
            tracker = container "Shipment tracker" "Tracks parcels." "Kotlin"
            carriers = container "Carrier gateway" "Books carriers." "Kotlin"

            tracker -> carriers "Books through"
        }

        orders -> tracker "Ships through"
        carriers -> customer "Delivers to"
    }

    views {
        container shipping "Containers" {
            default
            include *
            autoLayout lr
        }
    }

    configuration {
        scope softwaresystem
    }
}
