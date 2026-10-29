workspace "Acme" "The landscape scoped workspace of the enterprise DSL fixture." {

    model {
        !include shared/people.dsl

        storefront = softwareSystem "Storefront" "The shop customers browse." {
            url "{workspace:0}/diagrams"
        }
        orders = softwareSystem "Orders" "Takes and tracks orders." {
            url "{workspace:0}/diagrams"
        }
        payments = softwareSystem "Payments" "Charges customers." {
            url "{workspace:0}/diagrams#Containers"
        }

        customer -> storefront "Shops in"
        storefront -> orders "Places orders with"
        orders -> payments "Charges through"
    }

    views {
        systemLandscape "Landscape" {
            include *
            autoLayout lr
        }
    }

    configuration {
        scope landscape
    }
}
