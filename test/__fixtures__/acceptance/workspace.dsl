/*
 * The purpose-built acceptance workspace (spec 15.3): one workspace that
 * exercises every drawing rule the React Flow engine has to honor.
 *
 * The layout lives in workspace.json beside this file, since the DSL has
 * no syntax for coordinates or vertices. Edit mode edits it, and so does
 * Structurizr Local. Leave the Containers view alone in edit mode: "Queue"
 * stays unplaced there on purpose, and edit mode's first edit of a view
 * stores every element.
 *
 * Regenerate workspace.json with `pnpm fixtures:acceptance`, after a DSL
 * change or an edit-mode session. It runs Structurizr's `merge` on this
 * file with workspace.json as the layout, marks the elements tagged
 * "Internal" with `location: Internal`, names the enterprise and formats
 * the result with Biome: structurizr-java 5 dropped the enterprise and
 * element locations, which the enterprise boundary of older workspaces
 * still needs.
 *
 * The `!script` block at the end adds the childless spare server to the
 * Deployment view, which `include *` leaves out. It sets no layout.
 */
workspace "Acceptance" "Every drawing rule of the renderer spec in one workspace" {

    !impliedRelationships false

    model {
        customer = person "Customer" "Buys things online"
        clerk = person "Shop\nclerk" "Packs and ships the orders customers place" "Internal"

        shop = softwareSystem "Shop" "Takes orders, charges cards and hands parcels to couriers" "Internal" {
            url "https://github.com/example/shop"
            properties {
                "Runbook" "https://runbooks.example.com/shop"
            }
            web = container "Web App" "Serves the storefront" "React"
            api = container "API" "Handles orders and payments" "Node.js"
            db = container "Database" "Stores orders" "PostgreSQL" "Database"
            queue = container "Queue" "Holds orders until the warehouse takes them" "RabbitMQ" "Queue"
        }
        warehouse = softwareSystem "Warehouse" "Keeps the stock, picks every item of an order off the shelves, packs it into a parcel sized to fit, prints the label and keeps the parcel until the courier collects it, then tells the shop the order has left" "Internal"
        payments = softwareSystem "Card\ngateway" "Charges cards" "External"
        courier = softwareSystem "Courier" "Delivers parcels" "External"

        customer -> shop "Places orders with" "HTTPS"
        clerk -> warehouse "Packs orders in" "" "Orthogonal"
        shop -> payments "Charges cards with" "HTTPS" "Curved"
        shop -> warehouse "Sends orders to" "AMQP"
        warehouse -> courier "Books deliveries with" "HTTPS" "Orthogonal"
        payments -> customer "Emails receipts to" "SMTP" "Curved"

        customer -> web "Checks out using" "HTTPS"
        web -> api "Places orders using" "JSON/HTTPS"
        api -> db "Reads from and writes to" "SQL"
        api -> payments "Charges cards using" "HTTPS"
        api -> queue "Publishes orders to" "AMQP"
        queue -> warehouse "Delivers orders to" "AMQP"

        live = deploymentEnvironment "Live" {
            cloud = deploymentNode "Cloud" "" "Hosting provider" {
                webServer = deploymentNode "Web server" "" "nginx" {
                    webInstance = containerInstance web
                }
                apiServer = deploymentNode "API server" "" "Node.js" "" 2 {
                    apiInstance = containerInstance api
                }
                dbServer = deploymentNode "Database server" "" "PostgreSQL" {
                    dbInstance = containerInstance db
                }
                spare = deploymentNode "Spare server" "Kept empty for failover" "Ubuntu"
            }
        }

        box = element "Box" "Shape" "" "Shape,Shape:Box"
        roundedBox = element "RoundedBox" "Shape" "" "Shape,Shape:RoundedBox"
        circle = element "Circle" "Shape" "" "Shape,Shape:Circle"
        ellipse = element "Ellipse" "Shape" "" "Shape,Shape:Ellipse"
        hexagon = element "Hexagon" "Shape" "" "Shape,Shape:Hexagon"
        diamond = element "Diamond" "Shape" "" "Shape,Shape:Diamond"
        cylinder = element "Cylinder" "Shape" "" "Shape,Shape:Cylinder"
        bucket = element "Bucket" "Shape" "" "Shape,Shape:Bucket"
        pipe = element "Pipe" "Shape" "" "Shape,Shape:Pipe"
        personShape = element "Person" "Shape" "" "Shape,Shape:Person"
        robot = element "Robot" "Shape" "" "Shape,Shape:Robot"
        folder = element "Folder" "Shape" "" "Shape,Shape:Folder"
        webBrowser = element "WebBrowser" "Shape" "" "Shape,Shape:WebBrowser"
        window = element "Window" "Shape" "" "Shape,Shape:Window"
        portrait = element "Mobile device\nportrait" "Shape" "" "Shape,Shape:MobileDevicePortrait"
        landscape = element "Mobile device\nlandscape" "Shape" "" "Shape,Shape:MobileDeviceLandscape"
        component = element "Component" "Shape" "" "Shape,Shape:Component"
        shell = element "Shell" "Shape" "" "Shape,Shape:Shell"
        terminal = element "Terminal" "Shape" "" "Shape,Shape:Terminal"

        iconTop = element "Icon on top" "Style" "The icon sits above the name" "Icon,Icon:Top"
        iconBottom = element "Icon at the bottom" "Style" "The icon sits below the description" "Icon"
        iconLeft = element "Icon on the left" "Style" "The icon sits left of the text" "Icon,Icon:Left"
        faded = element "Faded" "Style" "Fill and stroke at 40% opacity, text and icon opaque" "Faded"
        dashed = element "Dashed border" "Style" "A thick dashed stroke" "Dashed"
        dotted = element "Dotted border" "Style" "A thick dotted stroke" "Dotted"
    }

    views {
        systemLandscape "Landscape" "Every routing mode, with and without vertices, inside and across the enterprise boundary" {
            include customer clerk shop warehouse payments courier
        }

        filtered "Landscape" exclude "External" "LandscapeInternal" "The landscape without the External elements"

        systemLandscape "LandscapeAutomatic" "The landscape laid out automatically, with the enterprise boundary around the shop's own people and systems" {
            include customer clerk shop warehouse payments courier
            autoLayout tb 300 300
        }

        systemContext shop "Context" "The shop and its neighbors, laid out automatically" {
            include *
            autoLayout lr 300 300
        }

        container shop "Containers" "A stored layout that leaves the queue unplaced" {
            include *
        }

        dynamic shop "Checkout" "Charging the card and saving the order run in parallel" {
            customer -> web "Checks out using"
            web -> api "Places the order using"
            {
                {
                    api -> db "Saves the order in"
                }
                {
                    api -> payments "Charges the card with"
                }
            }
            api -> queue "Publishes the order to"
            autoLayout lr 300 300
        }

        deployment shop live "Deployment" "Live, with a spare server that holds nothing" {
            include *
        }

        custom "Shapes" "Shapes" "All 19 shapes, in light and dark styles" {
            include box roundedBox circle ellipse hexagon diamond cylinder bucket pipe personShape robot folder webBrowser window portrait landscape component shell terminal
        }

        custom "Styles" "Styles" "Icon positions, opacity and borders" {
            include iconTop iconBottom iconLeft faded dashed dotted
        }

        styles {
            element "Element" {
                background #1168bd
                color #ffffff
            }
            element "Person" {
                shape Person
                background #08427b
            }
            element "Container" {
                background #438dd5
            }
            element "Database" {
                shape Cylinder
            }
            element "Queue" {
                shape Pipe
            }
            element "External" {
                background #999999
            }
            element "Deployment Node" {
                background #ffffff
                color #000000
            }
            element "Shape:Box" {
                shape Box
            }
            element "Shape:RoundedBox" {
                shape RoundedBox
            }
            element "Shape:Circle" {
                shape Circle
            }
            element "Shape:Ellipse" {
                shape Ellipse
            }
            element "Shape:Hexagon" {
                shape Hexagon
            }
            element "Shape:Diamond" {
                shape Diamond
            }
            element "Shape:Cylinder" {
                shape Cylinder
            }
            element "Shape:Bucket" {
                shape Bucket
            }
            element "Shape:Pipe" {
                shape Pipe
            }
            element "Shape:Person" {
                shape Person
            }
            element "Shape:Robot" {
                shape Robot
            }
            element "Shape:Folder" {
                shape Folder
            }
            element "Shape:WebBrowser" {
                shape WebBrowser
            }
            element "Shape:Window" {
                shape Window
            }
            element "Shape:MobileDevicePortrait" {
                shape MobileDevicePortrait
            }
            element "Shape:MobileDeviceLandscape" {
                shape MobileDeviceLandscape
            }
            element "Shape:Component" {
                shape Component
            }
            element "Shape:Shell" {
                shape Shell
            }
            element "Shape:Terminal" {
                shape Terminal
            }
            element "Icon" {
                icon "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMjgiIGZpbGw9IiNmNTllMGIiLz48cGF0aCBkPSJNMjAgMzNsOCA4IDE2LTE4IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+"
            }
            element "Icon:Top" {
                iconPosition Top
            }
            element "Icon:Left" {
                iconPosition Left
            }
            element "Faded" {
                opacity 40
                icon "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMjgiIGZpbGw9IiNmNTllMGIiLz48cGF0aCBkPSJNMjAgMzNsOCA4IDE2LTE4IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+"
            }
            element "Dashed" {
                border Dashed
                stroke #f59e0b
                strokeWidth 6
            }
            element "Dotted" {
                border Dotted
                stroke #f59e0b
                strokeWidth 6
            }
            relationship "Relationship" {
                color #707070
            }
            relationship "Orthogonal" {
                routing Orthogonal
            }
            relationship "Curved" {
                routing Curved
            }

            light {
                element "Shape" {
                    background #dbeafe
                    color #1e3a5f
                    stroke #1e3a5f
                }
            }
            dark {
                element "Element" {
                    background #0b3d6e
                    color #e0e0e0
                }
                element "Shape" {
                    background #1e3a5f
                    color #dbeafe
                    stroke #dbeafe
                }
                relationship "Relationship" {
                    color #a0a0a0
                }
            }
        }
    }

    !script groovy {
        def spare = workspace.model.elements.find({ it.properties["structurizr.dsl.identifier"] == "spare" })
        workspace.views.getViewWithKey("Deployment").addElement(spare, false)
    }
}
