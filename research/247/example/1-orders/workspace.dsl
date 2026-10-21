workspace extends ../catalog.dsl {
    name "Orders"
    model {
        !element orders {
            api = container "Orders API"
        }
        customer -> orders "Places orders using"
        api -> payments "Charges cards using"
    }
    views {
        systemContext orders "OrdersContext" {
            include *
        }
        container orders "OrdersContainers" {
            include *
        }
    }
    configuration {
        scope softwaresystem
    }
}
