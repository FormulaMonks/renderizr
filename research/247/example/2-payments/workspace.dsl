workspace extends ../catalog.dsl {
    name "Payments"
    model {
        !element payments {
            gateway = container "Payment Gateway"
        }
        customer -> payments "Pays using"
    }
    views {
        container payments "PaymentsContainers" {
            include *
        }
    }
    configuration {
        scope softwaresystem
    }
}
