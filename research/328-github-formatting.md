# GitHub formatting audit: measurements

The data behind the support matrix in `research/328-comment.md`. The fixture is `test/__fixtures__/github-formatting.json`.

## The documentation runtime

`renderizr-docs.js` from `pnpm render test/__fixtures__/github-formatting.json --artifact` at 3.1.0: 222,638 bytes minified, 82,247 bytes gzipped at level 9. The markdown stack inside it (markdown-it 15.0.3, markdown-it-shift-headings 1.0.2, markdown-it-anchor 10.1.0 and highlight.js 11.12.0 core with 11 languages) bundles alone to 177,926 bytes (66,145 gzipped), about 80% of it.

## What each candidate adds

esbuild 0.28.2, `bundle`, `minify`, ESM, no legal comments. Each figure is the baseline plus the candidate in use, minus the baseline.

| Candidate                                            | Minified  | Share  | Gzipped   | Share  |
| ---------------------------------------------------- | --------- | ------ | --------- | ------ |
| `linkify: true`                                      | 53        | 0.0%   | 27        | 0.0%   |
| markdown-it-footnote 4.0.0                           | 5,142     | 2.3%   | 1,652     | 2.0%   |
| @mdit/plugin-footnote 1.2.0                          | 4,961     | 2.2%   | 1,793     | 2.2%   |
| @mdit/plugin-tasklist 1.3.0                          | 1,504     | 0.7%   | 670       | 0.8%   |
| @hackmd/markdown-it-task-lists 2.1.4                 | 2,030     | 0.9%   | 720       | 0.9%   |
| markdown-it-emoji 3.1.0, full set (1,903 shortcodes) | 54,453    | 24.5%  | 16,803    | 20.4%  |
| markdown-it-emoji 3.1.0, light set (150 shortcodes)  | 5,875     | 2.6%   | 2,443     | 3.0%   |
| markdown-it-texmath 1.0.0 without an engine          | 6,056     | 2.7%   | 2,076     | 2.5%   |
| temml 0.14.0                                         | 212,485   | 95.4%  | 59,301    | 72.1%  |
| katex 0.19.1                                         | 268,181   | 120.5% | 76,812    | 93.4%  |
| @mdit/plugin-katex-slim 1.2.0 with katex             | 275,438   | 123.7% | 80,102    | 97.4%  |
| @vscode/markdown-it-katex 1.1.2 with its katex       | 275,514   | 123.7% | 78,743    | 95.7%  |
| markdown-it-sub 2.0.0 and markdown-it-sup 2.0.0      | 1,279     | 0.6%   | 377       | 0.5%   |
| mermaid 12.3.0                                       | 5,377,304 | 2415%  | 1,523,699 | 1853%  |
| leaflet 1.9.4                                        | 150,229   | 67.5%  | 42,677    | 51.9%  |
| three 0.187.0, `WebGLRenderer` and `STLLoader`       | 538,948   | 242.1% | 134,417   | 163.4% |

texmath requires `katex` as a fallback engine, so bundling it as published adds a second KaTeX copy; the row above leaves it out, as an integration would. Assets beside the scripts: KaTeX's stylesheet is 24,793 bytes (3,512 gzipped) and its 20 WOFF2 fonts 259,792 bytes, 117% of the runtime, which gzip does not shrink. Temml's `Temml-Local.css` is 8,992 bytes (2,807 gzipped) and `Temml.woff2` 9,404 bytes.

## highlight.js languages

One language at a time on top of the 11 the runtime registers.

| Language     | Minified | Gzipped |
| ------------ | -------- | ------- |
| c            | 4,673    | 1,671   |
| cpp          | 6,058    | 2,081   |
| csharp       | 4,081    | 1,078   |
| diff         | 591      | 178     |
| ruby         | 3,915    | 1,150   |
| go           | 1,455    | 388     |
| graphql      | 727      | 229     |
| ini          | 952      | 288     |
| kotlin       | 3,354    | 958     |
| less         | 14,490   | 4,353   |
| lua          | 1,882    | 813     |
| makefile     | 1,060    | 379     |
| perl         | 4,665    | 1,542   |
| objectivec   | 2,836    | 1,080   |
| php          | 6,447    | 1,939   |
| php-template | 429      | 107     |
| plaintext    | 121      | 53      |
| python-repl  | 235      | 72      |
| r            | 2,914    | 1,112   |
| rust         | 2,943    | 1,019   |
| scss         | 14,577   | 4,451   |
| shell        | 240      | 97      |
| swift        | 8,317    | 3,117   |
| vbnet        | 2,626    | 1,097   |
| wasm         | 1,694    | 636     |
| dockerfile   | 422      | 156     |
| protobuf     | 685      | 217     |
| powershell   | 4,418    | 1,943   |
| nginx        | 1,507    | 423     |
| scala        | 2,058    | 551     |

Mean 3,346 bytes (1.5% of the runtime), 1,106 gzipped (1.3%). Median 2,342 bytes (1.1%), 886 gzipped (1.1%). All 30 together: 100,355 bytes (45%), 32,100 gzipped (39%).

## npm, 2026-11-13

| Package                        | Version | Last publish | License      | Downloads a week |
| ------------------------------ | ------- | ------------ | ------------ | ---------------- |
| markdown-it-footnote           | 4.0.0   | 2023-12-06   | MIT          | 1,019,785        |
| @mdit/plugin-footnote          | 1.2.0   | 2026-11-09   | MIT          | 25,443           |
| markdown-it-task-lists         | 2.1.1   | 2018-03-06   | ISC          | 4,220,966        |
| @hackmd/markdown-it-task-lists | 2.1.4   | 2024-03-27   | ISC          | 6,930            |
| @mdit/plugin-tasklist          | 1.3.0   | 2026-11-09   | MIT          | 27,560           |
| markdown-it-emoji              | 3.1.0   | 2026-07-22   | MIT          | 1,010,384        |
| markdown-it-texmath            | 1.0.0   | 2022-05-28   | MIT          | 87,294           |
| @mdit/plugin-tex               | 1.3.0   | 2026-11-09   | MIT          | 43,779           |
| @mdit/plugin-katex-slim        | 1.2.0   | 2026-11-09   | MIT          | 9,707            |
| @vscode/markdown-it-katex      | 1.1.2   | 2025-07-07   | MIT          | 397,405          |
| katex                          | 0.19.1  | 2026-10-23   | MIT          | 43,077,282       |
| temml                          | 0.14.0  | 2026-10-08   | MIT          | 1,868,431        |
| markdown-it-sub                | 2.0.0   | 2023-12-05   | MIT          | 628,442          |
| markdown-it-sup                | 2.0.0   | 2023-12-05   | MIT          | 752,187          |
| mermaid                        | 12.3.0  | 2026-11-03   | MIT          | 25,685,966       |
| leaflet                        | 1.9.4   | 2023-05-18   | BSD-2-Clause | 11,554,621       |
| three                          | 0.187.0 | 2026-10-30   | MIT          | 35,737,617       |
