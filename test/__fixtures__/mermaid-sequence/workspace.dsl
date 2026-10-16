workspace "Mermaid sequence diagrams" "Image views that carry Mermaid sequence diagram source, for the research in issue 195." {

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

        image * "checkout" {
            mermaid checkout.mmd
            title "Checkout"
            description "An actor and participants, a box, autonumber, activations, notes on every side and every common arrow."
        }

        image * "retry" {
            mermaid retry.mmd
            title "Export retry"
            description "Nested fragments: loop around alt around opt, then par, critical, break and rect."
        }

        image * "sign-in" {
            mermaid sign-in.mmd
            title "Sign-in"
            description "The source's own theme, mirrorActors off, create and destroy, stacked activations, a wrapped note and a long label."
        }
    }
}
