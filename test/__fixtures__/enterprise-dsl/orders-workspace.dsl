workspace "Orders" "The software system scoped workspace for Orders." {

    model {
        orders = softwareSystem "Orders" "Takes and tracks orders." {
            api = container "Orders API" "Takes orders." "Java"
            database = container "Orders database" "Holds orders." "PostgreSQL" {
                tags "Database"
            }
        }
        payments = softwareSystem "Payments" "Charges customers." {
            url "{workspace:0}/diagrams"
        }

        api -> database "Reads and writes"
        api -> payments "Charges through"
    }

    views {
        container orders "Containers" {
            include *
            autoLayout lr
        }
    }

    configuration {
        scope softwaresystem
    }
}
