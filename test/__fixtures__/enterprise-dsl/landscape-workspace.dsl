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

        shipping = softwareSystem "Shipping" "Ships orders to customers." {
            url "{workspace:0}/diagrams"
        }

        internetBanking = softwareSystem "Internet Banking System" "Big Bank plc's online banking, which settles card payments." {
            url "https://raw.githubusercontent.com/FormulaMonks/renderizr/9a88e1e12d793db5f43a22490c379f19e6959c8c/test/__fixtures__/enterprise-dsl/remote/big-bank-plc/workspace.json"
        }

        customer -> storefront "Shops in"
        storefront -> orders "Places orders with"
        orders -> payments "Charges through"
        payments -> internetBanking "Settles card payments with"
        orders -> shipping "Ships through"
        shipping -> customer "Delivers to"
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
