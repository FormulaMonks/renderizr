workspace "Mermaid flowcharts" "Image views that carry Mermaid flowchart source, for the prototype in issue 179." {

    model {
        customer = person "Customer"
    }

    views {
        properties {
            "mermaid.url" "https://mermaid.ink"
        }

        systemLandscape "landscape" {
            include *
        }

        image * "plain" {
            mermaid order-flow.mmd
            title "Order flow"
            description "Silent source: the workspace's styles and font fill in."
        }

        image * "styled" {
            mermaid order-flow-styled.mmd
            title "Order flow, styled"
            description "The source's init directive, classDef, style, linkStyle and click win."
        }

        image * "left-right" {
            mermaid order-flow-lr.mmd
            title "Order flow, left to right"
        }
    }
}
