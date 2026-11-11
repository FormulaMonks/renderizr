workspace "Big Bank plc" "Documentation and decisions at every documentation scope." {

    # The workspace's own documentation scope.
    !docs docs
    !adrs adrs

    model {
        customer = person "Personal Banking Customer"

        internetBanking = softwareSystem "Internet Banking System" {
            # The software system's documentation scope.
            !docs internet-banking-system/docs
            !adrs internet-banking-system/adrs

            webApplication = container "Web Application" "Delivers the single-page application." "Java and Spring MVC"

            apiApplication = container "API Application" "Serves JSON over HTTPS." "Java and Spring MVC" {
                # The container's documentation scope.
                !docs internet-banking-system/api-application/docs
                !adrs internet-banking-system/api-application/adrs

                signIn = component "Sign In Controller" "Signs customers in." "Spring MVC Rest Controller" {
                    # A component may carry decisions without sections.
                    !adrs internet-banking-system/api-application/sign-in-controller/adrs
                }
            }
        }

        customer -> webApplication "Visits"
        webApplication -> apiApplication "Calls" "JSON/HTTPS"
        customer -> signIn "Signs in with"
    }

    views {
        systemContext internetBanking "SystemContext" {
            include *
            autolayout lr
        }

        container internetBanking "Containers" {
            include *
            autolayout lr
        }

        component apiApplication "Components" {
            include *
            autolayout lr
        }
    }
}
