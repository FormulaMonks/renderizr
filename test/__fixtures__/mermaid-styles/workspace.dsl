workspace "Mermaid styles" "Mermaid flowcharts styled from their source, over the workspace's tag styles." {

    model {
    }

    views {
        properties {
            "mermaid.url" "https://mermaid.ink"
        }

        image * "silent" {
            mermaid silent.mmd
            title "Silent source"
            description "No theme and no themeVariables: the workspace's Mermaid styles sit over the primary color fill."
        }

        image * "styled" {
            mermaid styled.mmd
            title "Styled source"
            description "style, classDef and linkStyle win over the base theme's palette, which wins over the workspace's tag styles. curve step routes Orthogonal."
        }

        image * "dark" {
            mermaid dark.mmd
            title "Dark theme"
            description "theme dark draws a dark palette in both color schemes. curve linear routes Direct."
        }

        image * "fonts" {
            mermaid fonts.mmd
            title "Fonts and ignored styling"
            description "The source's fontFamily and fontSize, a node's own font-family, font-size and font-weight. curve basis routes Curved. The build warns about look, font-style and opacity."
        }

        image * "escaped" {
            mermaid escaped.mmd
            title "Escaped commas"
            description "A style and a linkStyle escape the comma in a dash array, as Mermaid's docs write it. Both draw dashed, and the build warns about nothing."
        }

        styles {
            element "Mermaid" {
                background "#e8eef4"
                stroke "#6b7f94"
                color "#1f2d3a"
            }
            relationship "Mermaid" {
                color "#6b7f94"
                routing Curved
            }
            element "Group" {
                color "#6b7f94"
            }
        }
    }
}
