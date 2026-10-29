workspace "Payments" "The software system scoped workspace for Payments." {

    model {
        payments = softwareSystem "Payments" "Charges customers." {
            gateway = container "Payment gateway" "Talks to the card networks." "Go"
        }
        orders = softwareSystem "Orders" "Takes and tracks orders."

        orders -> gateway "Charges through"
    }

    views {
        container payments "Containers" {
            include *
            autoLayout lr
        }
    }

    configuration {
        scope softwaresystem
    }
}
