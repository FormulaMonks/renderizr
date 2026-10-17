workspace "Mermaid ERDs" "Image views that carry Mermaid entity relationship diagram source." {

    model {
    }

    views {
        properties {
            "mermaid.url" "https://mermaid.ink"
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

        image * "styled" {
            mermaid styled.mmd
            description "A classDef and a style fill two entities; rowOdd and rowEven color every entity's rows."
        }
    }
}
