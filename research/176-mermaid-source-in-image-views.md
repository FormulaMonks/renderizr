# How a Structurizr image view carries Mermaid source

Research for the Mermaid diagram map: what the DSL's `mermaid` keyword writes to `workspace.json`, and where Renderizr should read a Mermaid diagram's source from.

## Answer

The source survives. Structurizr encodes it into the image view's `content` URL (`<mermaid.url>/svg/<encoded source>`), and `export`, `merge` and Structurizr Local all write the same URL. Read the source back from that URL. The one exception is `mermaid.inline` set to `true`: Structurizr then stores the server's picture as a data URI and drops the source, so that image view stays a picture.

Renderizr needs no property of its own to find the source, and authors change nothing in their DSL.

## Method

- Read the source of Structurizr at tag `v2026.09.19` of [structurizr/structurizr](https://github.com/structurizr/structurizr/tree/v2026.09.19). The Mermaid import code has not changed since the libraries moved into that repository in December 2025, and [structurizr/java](https://github.com/structurizr/java) holds the same `MermaidImporter` and `MermaidEncoder`, so the Homebrew `structurizr-cli` 2025.11.09 behaves the same.
- Ran Structurizr 2026.09.19 from the `structurizr/structurizr` Docker image: `export -format json`, `merge`, and `local`, against the sample workspace below. The local Java install was missing, so every run went through Docker.
- Decoded every `content` URL back to its source and compared it with the `.mmd` file byte for byte.

Paths below are relative to the Structurizr repository at `v2026.09.19`.

## What the `mermaid` keyword does

`mermaid <source|file|url|viewKey>` sits inside `image <key> { … }` (`structurizr-dsl/.../ImageViewContentParser.java`, lines 103–164). It takes one of four kinds of source:

- **Inline source**: a token that contains a newline, written as a `"""` text block (line 118).
- **A view key**: the key of a C4 view in the same workspace. Structurizr exports that view to Mermaid with `MermaidDiagramExporter` and copies the view's title and description (lines 122–133).
- **A URL**: Structurizr fetches the text over HTTP(S) and titles the view with the URL's last segment (lines 135–145). It needs the `HTTP` or `HTTPS` feature.
- **A file**: resolved against the DSL file's folder (lines 147–157). It needs the `FILE_SYSTEM` feature, marks the DSL as not portable, and titles the view with the file name (`MermaidImporter.java`, line 35).

Each kind hands the text to `MermaidImporter.importDiagram` (`structurizr-import/.../mermaid/MermaidImporter.java`, lines 44–85). Four properties steer it, each read from the image view's own properties first and the view set's properties second (`AbstractDiagramImporter.java`, lines 35–42):

| Property | Default | Effect |
| --- | --- | --- |
| `mermaid.url` | none | The Mermaid server. Without it the DSL fails to parse: `Please define a view/viewset property named mermaid.url to specify your Mermaid server`. |
| `mermaid.format` | `svg` | `svg` builds `<url>/svg/<encoded>`; `png` builds `<url>/img/<encoded>?type=png`. Any other value fails the parse. Sets `contentType` to `image/svg+xml` or `image/png`. |
| `mermaid.compress` | `true` | `true` encodes the source as `pako:` plus deflated JSON; `false` encodes the raw source as Base64. |
| `mermaid.inline` | unset | `true` makes Structurizr fetch the URL during the parse and store the response as a `data:` URI. Anything else stores the URL itself. |

Structurizr calls the Mermaid server only when `mermaid.inline` is `true`. Otherwise the parse makes no request at all: it builds the URL and stores it, and whoever shows the image view fetches the picture later. An unreachable server therefore only matters with `mermaid.inline`, and there it fails the whole parse:

```text
com.structurizr.dsl.StructurizrDslParserException: The content from http://127.0.0.1:9/svg/pako:eJyr… could not be loaded: Connect to http://127.0.0.1:9 failed: Connection refused at line 15 of /usr/local/structurizr/unreachable.dsl: mermaid erd.mmd
```

In the same run, an image view with the same unreachable `mermaid.url` and no `mermaid.inline` parsed fine. The CLI allows every URL (`AbstractCommand.java`, line 75) with the HTTP client's 10 second timeout; Structurizr Local allows every URL by default (`structurizr.network.urls.allowed`, `Configuration.java`, line 284) with a 60 second timeout.

The properties apply at the moment the parser reaches the `mermaid` line. A `properties` block written after it lands in the JSON but changed nothing: in the sample, `mermaid.format` `png` after the `mermaid` line left the content as SVG. A `title` before the `mermaid` line loses to the file name; a `title` after it wins.

`light { mermaid … }` and `dark { mermaid … }` blocks inside the image view write `contentLight` and `contentDark` instead of `content` (`StructurizrDslParser.java`, lines 1140–1148; `ImageView.java`, lines 99–120). An image view that ends with no content fails the parse: `The image view "<key>" has no content` (`ImageViewDslContext.java`, lines 50–52).

## How the source is encoded

`MermaidEncoder.java` (lines 14–31) does one of two things:

- **Compressed** (the default): it fills the template `{ "code":"<source>", "mermaid":{"theme":"default"}}`, deflates it with `java.util.zip.Deflater` (zlib format), encodes it as URL-safe Base64, and prefixes `pako:`. Before filling the template it replaces each newline with `\n` and each `"` with `\"`, and escapes nothing else.
- **Uncompressed** (`mermaid.compress` `false`): URL-safe Base64 of the raw UTF-8 source.

The compressed payload is not always valid JSON, because the encoder leaves backslashes, carriage returns and tabs alone. A source with a tab and CRLF line endings, run through `JSON.parse` after inflating, fails with `Invalid control character`, and a source with `\"` in a label ends the string early. Decode it by stripping the fixed prefix and suffix and undoing the two replacements in one left-to-right pass (`\n` to a newline, `\"` to `"`). That round-trips every sample byte for byte, CRLF, tabs, `é` and `\"` included, with one ambiguity: a literal backslash followed by `n` in the source comes back as a backslash and a line break. Mermaid uses `<br>` for line breaks in labels, so that sequence is rare. The uncompressed form round-trips exactly.

The template always asks the server for the `default` theme. The source's own frontmatter and `%%{init}%%` directives ride inside `code` untouched, so Renderizr sees the author's config exactly as written. The `dark` block changes which field holds the URL and nothing in the request, so a dark picture comes out in the default theme unless its source sets one.

## What reaches `workspace.json`

`ImageView` holds `content`, `contentLight`, `contentDark`, `contentType` and `elementId` (`ImageView.java`, lines 13–18), plus `key`, `title`, `description`, `order` and `properties` from `View`. Its name is its title. Nothing else is recorded: no file path, no kind of source, no format.

### Sample workspace

`flow.mmd`:

```text
---
config:
  flowchart:
    curve: linear
---
flowchart LR
    A["Customer"] -->|places| B{"Order valid?"}
    B -->|yes| C["Ship it"]
    B -->|no| D["Reject"]
    click C href "https://example.com" "Docs"
```

`erd.mmd`:

```text
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
```

`workspace.dsl`:

```text
workspace "Mermaid image views" {

    model {
        user = person "User"
    }

    views {
        properties {
            "mermaid.url" "https://mermaid.ink"
        }

        systemLandscape "landscape" {
            include *
        }

        image * "flow" {
            title "Order flow"
            properties {
                "renderizr.mermaid.source" "flow.mmd"
            }
            mermaid flow.mmd
        }

        image * "erd-inline" {
            properties {
                "mermaid.inline" "true"
                "mermaid.format" "svg"
            }
            mermaid erd.mmd
        }

        image * "sequence-source" {
            properties {
                "mermaid.compress" "false"
            }
            mermaid """
                sequenceDiagram
                    Alice->>Bob: Hello
                    Bob-->>Alice: Hi
            """
        }

        image * "schemes" {
            light {
                mermaid flow.mmd
            }
            dark {
                mermaid erd.mmd
            }
        }

        image * "from-view" {
            mermaid landscape
        }
    }
}
```

Exported with:

```bash
docker run --rm -v "$PWD:/usr/local/structurizr" structurizr/structurizr:2026.09.19 export -workspace /usr/local/structurizr/workspace.dsl -format json -output /usr/local/structurizr/out
```

### Resulting image views

The `erd-inline` data URI is cut short below (it runs to 13,066 characters); every other value is complete. Structurizr also writes `"contentLight": null` and `"contentDark": null` (or `"content": null`) on each view; they are left out here.

```json
{
  "views": {
    "configuration": {
      "properties": { "mermaid.url": "https://mermaid.ink" }
    },
    "imageViews": [
      {
        "key": "flow",
        "order": 2,
        "title": "flow.mmd",
        "name": "flow.mmd",
        "properties": { "renderizr.mermaid.source": "flow.mmd" },
        "contentType": "image/svg+xml",
        "content": "https://mermaid.ink/svg/pako:eJxNj01PwzAMQP-K5TNh9xxArDsiIY0j3iFyXBLIR5WmG6jtfyfrJOBov_ckewbkbAU1KqUocU69f9eUAPqQL-xMqdsEwFM5i4bgk5hCadN_HXg-3qynN8JuGmuOUghPoNTDMgTDMi6wnwlfipUCZxO8fSRcb9F-076vTtf6V-cH8LXl_3HKCxwaPcqH8B_k4PkTOnBFeiB0tQ6j3u3ky8QhyD3nSNj2h8wjISW8A2ynReMt6hmrk3h93kpvplBxXX8AL25YKw=="
      },
      {
        "key": "erd-inline",
        "order": 3,
        "title": "erd.mmd",
        "name": "erd.mmd",
        "properties": { "mermaid.format": "svg", "mermaid.inline": "true" },
        "contentType": "image/svg+xml",
        "content": "data:image/svg+xml;base64,PHN2ZyBpZD0ibWVybWFpZC1zdmciIHdpZHRoPSIxMDAlIiB4bWxucz0i…"
      },
      {
        "key": "sequence-source",
        "order": 4,
        "properties": { "mermaid.compress": "false" },
        "contentType": "image/svg+xml",
        "content": "https://mermaid.ink/svg/c2VxdWVuY2VEaWFncmFtCiAgICBBbGljZS0-PkJvYjogSGVsbG8KICAgIEJvYi0tPj5BbGljZTogSGk="
      },
      {
        "key": "schemes",
        "order": 5,
        "title": "erd.mmd",
        "name": "erd.mmd",
        "contentType": "image/svg+xml",
        "contentLight": "https://mermaid.ink/svg/pako:eJxNj01PwzAMQP-K5TNh9xxArDsiIY0j3iFyXBLIR5WmG6jtfyfrJOBov_ckewbkbAU1KqUocU69f9eUAPqQL-xMqdsEwFM5i4bgk5hCadN_HXg-3qynN8JuGmuOUghPoNTDMgTDMi6wnwlfipUCZxO8fSRcb9F-076vTtf6V-cH8LXl_3HKCxwaPcqH8B_k4PkTOnBFeiB0tQ6j3u3ky8QhyD3nSNj2h8wjISW8A2ynReMt6hmrk3h93kpvplBxXX8AL25YKw==",
        "contentDark": "https://mermaid.ink/svg/pako:eJyrVlBKzk9JVbJSSi1yyUxML0rMjclTAALn0OAQf1_XIIWaGl3d_GoF_yAXIMdKoSAnMTm1GKIGIgZSUFOt4OPp5xrvGeLqC1SUnJ9XkpiZB1SmpKOglJtalJuYmaJkVa1UkpGaC7IsJTUtsTSnRKm2FgALpSir"
      },
      {
        "key": "from-view",
        "order": 6,
        "title": "System Landscape View",
        "name": "System Landscape View",
        "contentType": "image/svg+xml",
        "content": "https://mermaid.ink/svg/pako:eJxtkM1rwkAQxf-VYUrJJVIFobC1OfTcQ8HqxXhYs5NkcD_C7lq14v_exLXQD-c0A7_35vFOgJVThAIbL7sW3l9KC6DZbufxqAkU1XKnI9SstbirL1PagQm7TZIolv1iYFXi_BgiGXiVVoVKdgRLpn2J64HvFcnxiv90zEP0bku_HwBMesuZ4o-kfM5qZ-NoT9y0UcDGaZUVi0B-9tAzxT8w8CcJeBzfP4GRvmE7iq4TMO4OWbF6Ix-cXSfpn4ST29mml8krp53_vlJSsgpzQEPeSFYoThhbMkOp1_rwfP4Cgcx5cA=="
      }
    ]
  }
}
```

What the sample shows:

- `flow`: the `content` URL decodes to `flow.mmd` exactly, frontmatter and `click` line included. The `title "Order flow"` line lost to the file name because it came before `mermaid`.
- `erd-inline`: the data URI holds mermaid.ink's SVG (`class="erDiagram"`, `aria-roledescription="er"`) and no source.
- `sequence-source`: an inline source has no title at all. The URL decodes to the text block with its indentation removed.
- `schemes`: `contentLight` decodes to `flow.mmd` and `contentDark` to `erd.mmd`. The title comes from the last file read.
- `from-view`: the URL decodes to Structurizr's own Mermaid export of the landscape view, a `graph TB` with HTML labels and `style` lines.
- The view set keeps `mermaid.url` in `views.configuration.properties`, and each view keeps its own properties, so a reader of the JSON can rebuild exactly what the parser saw.

## Export, merge and Structurizr Local write the same thing

All three run the same `StructurizrDslParser`, and none of them touches an image view after the parse:

- **`merge`** loads the DSL, then calls `ViewSet.copyLayoutInformationFrom` and `Configuration.copyConfigurationFrom` (`MergeCommand.java`, lines 77–79). `copyLayoutInformationFrom` walks custom, landscape, context, container, component, dynamic and deployment views and skips image views (`ViewSet.java`, lines 1068–1145); `copyConfigurationFrom` copies only the last saved view (`Configuration.java`, lines 144–146).
- **Structurizr Local** parses `workspace.dsl`, copies layout from `workspace.json` the same way, and writes the result back to `workspace.json` on every load (`LocalFileSystemWorkspaceAdapter.java`, lines 106–147).

Measured: the image views in the `export`, `merge` and Structurizr Local outputs of the sample are identical, field for field, inline SVG included. For `merge`, the layout file had a `title` and a property added by hand to the `flow` image view; the output dropped both and kept what the DSL says.

So edit mode and builds see the same image views. A DSL session (ADR 16) already reruns `merge` when a file under the DSL's folder changes, and a `.mmd` file next to `workspace.dsl` is such a file, so a changed source reaches the page with no new plumbing. Because `merge` makes no network request without `mermaid.inline`, the DSL session also works offline.

## A property of our own

The source survives, so Renderizr needs no property of its own. For the record: a property such as `renderizr.mermaid.source` set in the DSL reaches the JSON unchanged through `export`, `merge` and Structurizr Local, as `flow` shows. A property added to `workspace.json` by hand disappears on the next `merge` or Structurizr Local load whenever the workspace has a DSL, because both rebuild image views from the DSL. A path in such a property would also need the DSL's folder at build time, which builds from `workspace.json` alone do not have, and the source text in a property would repeat what the `mermaid` line already says.

## Recommendation

Read a Mermaid diagram's source from the image view's own content:

1. For each of `content`, `contentLight` and `contentDark`, resolve `mermaid.url` the way Structurizr does: the image view's property, else the view set's (`views.configuration.properties`).
2. Treat the field as Mermaid when it starts with `<mermaid.url>/svg/` or `<mermaid.url>/img/`. Matching the property, and leaving the host alone, covers self-hosted Mermaid servers and avoids guessing at other image URLs.
3. Decode the segment after `/svg/` or `/img/` (dropping any `?type=png`): with a `pako:` prefix, inflate it as zlib (the browser's `DecompressionStream("deflate")` and Node's `zlib.inflateSync` both read it, so no library is needed), strip the fixed template and undo the two replacements; without the prefix, read it as Base64 of UTF-8.
4. Read the diagram type from the decoded source (after any frontmatter and directives) and draw it only for `flowchart` or `graph`, `erDiagram` and `sequenceDiagram`. Every other image view keeps working exactly as today.

Points for the spec to settle:

- **Inlined pictures.** With `mermaid.inline` `true` the source is gone, and Renderizr can tell a Mermaid picture only by its SVG's `aria-roledescription`. Keep such an image view as a picture and say in the docs that a Mermaid diagram needs `mermaid.inline` left unset. That differs from the map's rule that a Mermaid diagram Renderizr can't draw shows an error, so the spec should state which side of the line an inlined picture falls on.
- **`mermaid <viewKey>`.** Structurizr's own export of a C4 view decodes to a `graph TB` that Renderizr would draw as a flowchart, with HTML in its labels and Structurizr's colors in `style` lines. Renderizr already draws the C4 view itself, so the spec should decide whether to draw these, keep them as pictures, or point at the C4 view. The JSON carries no marker for them beyond the shape of the source.
- **Light and dark sources.** `contentLight` and `contentDark` can hold two different sources. The dark mode question should cover whether Renderizr draws each one in its own color scheme.
- **`mermaid.url` stays required.** Structurizr refuses the DSL without it, even when only Renderizr draws the diagram. Any value works when `mermaid.inline` is unset, since nothing calls it; the docs should suggest `https://mermaid.ink` so the workspace still shows pictures in Structurizr.
- **Titles.** A file gives the view its file name as title unless a `title` line follows the `mermaid` line, and an inline source gives no title at all. Renderizr's view list and the title block should fall back to the key, as they do for any untitled view.
- **The literal `\n` ambiguity** in compressed sources, noted above.
