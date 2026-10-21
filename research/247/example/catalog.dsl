workspace "System catalog" {
    model {
        customer = person "Customer"
        orders = softwareSystem "Orders" "Takes orders."
        payments = softwareSystem "Payments" "Takes payments."
    }
    configuration {
        scope landscape
    }
}
