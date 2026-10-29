workspace "Storefront" "The software system scoped workspace for Storefront." {

    model {
        !include shared/people.dsl

        storefront = softwareSystem "Storefront" "The shop customers browse." {
            web = container "Web shop" "Serves the shop." "TypeScript"
        }
        orders = softwareSystem "Orders" "Takes and tracks orders."

        customer -> web "Shops in"
        web -> orders "Places orders with"
    }

    views {
        container storefront "Containers" {
            include *
            autoLayout lr
        }
    }

    configuration {
        scope softwaresystem
    }
}
