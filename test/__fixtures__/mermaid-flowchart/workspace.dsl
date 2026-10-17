workspace "Mermaid flowcharts" "Image views that carry Mermaid flowchart source, which Renderizr draws as Mermaid diagrams." {

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

        image * "release" {
            mermaid release.mmd
            title "Release pipeline"
            description "About 30 nodes: a subgraph no edge crosses, crossed and nested subgraphs, a subgraph with its own direction and long back edges."
        }

        image * "signup" {
            mermaid signup.mmd
            title "Sign-up"
            description "No subgraphs: spacing and edge labels alone."
        }

        image * "left-right" {
            mermaid order-flow-lr.mmd
            title "Order flow, left to right"
        }

        image * "untitled" {
            mermaid untitled.mmd
        }

        image * "links" {
            mermaid links.mmd
            title "Click links"
            description "Nodes that link to other views, to URLs and to this view itself, and a click callback."
        }
    }
}
