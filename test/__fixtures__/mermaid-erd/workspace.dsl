workspace "Mermaid ERDs" "Image views that carry Mermaid entity relationship diagram source, for the prototype in issue 192." {

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

        image * "shop" {
            mermaid shop.mmd
            title "Shop"
            description "Six entities: composite keys, an entity without keys, one without attributes, every cardinality."
        }

        image * "shop-lr" {
            mermaid shop-lr.mmd
            title "Shop, left to right"
        }
    }
}
