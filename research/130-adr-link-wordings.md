# ADR link wordings and decision set sizes

Research for the decision graph: which link wordings reach a decision's `links` in the workspace JSON, whether `links` carries both directions, and how large real decision sets get. Measured on 2026-10-08.

## Answer in short

- **Structurizr copies the wording verbatim.** The adr-tools and Log4brains importers put whatever text stands before a Markdown link into `description`, with no list of known wordings and no normalization. The MADR importer ignores the wording and writes `Links to` for every link. Unknown wordings pass through untouched, so the decision graph has to classify by pattern and treat the rest as references.
- **`links` holds only what each file states.** No importer adds the reverse link. adr-tools writes both sides into the Markdown when someone uses `adr new -s`, `adr new -l` or `adr link`, but hand-written ADRs often state one side only. The decision graph has to merge the two sides of a pair itself.
- **Each decision holds at most one link per target.** `Decision` keeps its links in a `TreeSet` ordered by target id, so a second link to the same decision with another wording disappears.
- **Real sets stay under 100 per folder, with few links.** Across 13 public repos, folders hold 9 to 78 decisions (median 25). Most decisions carry no link that reaches the workspace JSON; the densest public set averages 0.22 per decision. Renderizr's own set (2.26 per decision) is ten times denser than any sampled public set.

## What each importer turns into `links`

Sources are in [structurizr/structurizr](https://github.com/structurizr/structurizr) at `da99caf`, which carries the importers since [structurizr/java](https://github.com/structurizr/java) went read-only in 2026. The `!adrs` DSL keyword picks the importer by name and defaults to adr-tools ([`DecisionsParser.java` L15-L17, L43-L47](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-dsl/src/main/java/com/structurizr/dsl/DecisionsParser.java#L15-L47)).

### adr-tools (`!adrs <path>` or `!adrs <path> adrtools`)

[`AdrToolsDecisionImporter.java`](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java)

- It reads links only between `## Status` and `## Context` ([L184-L211](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L184-L211)). A link anywhere else in the body never reaches `links`.
- Each line matches `(.*) \[.*]\((.*)\)` ([L46](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L46)). Group 1 becomes `description`, verbatim, and group 2 has to equal a decision's bare filename ([L200-L206](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L200-L206)). Both groups are greedy, so:
  - a line yields at most one link (the last one on it);
  - any `)` after the link breaks the target, and the importer drops the link without a warning;
  - a target with a path (`./0016-x.md`) never matches, and the link disappears;
  - a line that starts with `[` (a continuation line) has no wording and never matches.
- It rewrites the status word `Superceded` to `Superseded` ([L170-L174](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L170-L174)) but leaves link wordings alone, so `Superceded by` and `Supercedes` reach the JSON as written.
- It takes the id from the first four characters of every `.md` file name ([L84](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L84), [L132](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java#L132)), so three-digit names (`010-x.md`) and `adr-045-x.md` fail the import unless excluded.

adr-tools itself writes these wordings ([npryce/adr-tools at `b3279ba`](https://github.com/npryce/adr-tools/tree/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/src)):

- `adr new -s N` writes `Superceded by` into the old decision, removes its `Accepted` line and writes `Supercedes` into the new one ([`adr-new` L115-L120](https://github.com/npryce/adr-tools/blob/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/src/adr-new#L115-L120)). Both carry the old misspelling.
- `adr new -l "N:Forward:Reverse"` and `adr link SOURCE Forward TARGET Reverse` write any wording the user types, one on each side ([`adr-new` L122-L130](https://github.com/npryce/adr-tools/blob/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/src/adr-new#L122-L130), [`adr-link` L22-L23](https://github.com/npryce/adr-tools/blob/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/src/adr-link#L22-L23)). Its README suggests `Amends:Amended by`.
- Every link lands on its own line, as `<wording> [<number>. <title>](<file>)`, at the end of the Status section ([`_adr_add_link` L11-L26](https://github.com/npryce/adr-tools/blob/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/src/_adr_add_link#L11-L26)). That is exactly the shape the importer reads.

### MADR (`!adrs <path> madr`)

[`MadrDecisionImporter.java`](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java)

- It reads every Markdown link in the body, wherever it stands ([L184-L198](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java#L184-L198)), with the same greedy pattern `\[.*]\((.*)\)` ([L31](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java#L31)), so it also keeps at most one link per line.
- Every link gets the wording `Links to` ([L33](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java#L33), [L194](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java#L194)).
- It strips the YAML front matter before it looks for links ([L103-L104](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/MadrDecisionImporter.java#L103-L104)). MADR states supersession in front matter (`status: superseded by ADR-0005`), so a MADR workspace never carries a supersede link; the only trace is the free text in `status`.

### Log4brains (`!adrs <path> log4brains`)

[`Log4brainsDecisionImporter.java`](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java)

- It reads the `- Status:` line with `- Status: (.*) \[.*]\((.*)\)` ([L24](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java#L24)), so `- Status: superseded by [x](20240114-x.md)` gives the wording `superseded by`, lower case.
- It reads every `- <wording> [title](file)` line from `## Links` to the end of the file ([L28](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java#L28), [L164-L200](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java#L164-L200)), with the wording verbatim (`Supersedes`, `Relates to`, anything else).
- It numbers decisions 1, 2, 3 in filename order ([L58-L72](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java#L58-L72)), so ids shift when someone adds a decision with an earlier date.
- It turns any status that starts with `superseded` into `superseded` ([L152-L154](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/main/java/com/structurizr/importer/documentation/Log4brainsDecisionImporter.java#L152-L154)).

The importer tests pin these wordings: `Amended by` for adr-tools, `Links to` for MADR, and `Relates to`, `superseded by` and `Supersedes` for Log4brains ([`AdrToolsDecisionImporterTests.java` L118](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/test/java/com/structurizr/importer/documentation/AdrToolsDecisionImporterTests.java#L118), [`MadrDecisionImporterTests.java` L232](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/test/java/com/structurizr/importer/documentation/MadrDecisionImporterTests.java#L232), [`Log4brainsDecisionImporterTests.java` L215-L227](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-import/src/test/java/com/structurizr/importer/documentation/Log4brainsDecisionImporterTests.java#L215-L227)).

### What every importer shares

[`Decision.java`](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-core/src/main/java/com/structurizr/documentation/Decision.java) holds `links` in a `TreeSet` ([L19](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-core/src/main/java/com/structurizr/documentation/Decision.java#L19)) whose `Link.compareTo` compares the target id only ([L204-L206](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-core/src/main/java/com/structurizr/documentation/Decision.java#L204-L206)). `addLink` skips a link to the decision itself ([L99-L103](https://github.com/structurizr/structurizr/blob/da99caf2f2857e5373f7b58569152274f1725ba3/structurizr-core/src/main/java/com/structurizr/documentation/Decision.java#L99-L103)). So:

- a decision carries at most one link per target, and the first one in the file wins;
- no decision links to itself;
- `links` comes out sorted by id as a string (`"10"` before `"2"`), so its order means nothing;
- no importer adds a reverse link.

## Both directions or one?

Only what each file states. The importers read one file at a time and never add the reverse side.

- **Renderizr's own set states both sides, and the JSON matches it**, apart from three lost links. ADR 10 and ADR 17 reference ADR 4 and ADR 10 on Status lines that go on to mention `(0,0)`. The greedy pattern swallows those parentheses into the target, the lookup fails, and `architecture/workspace.json` lacks `10 References 4`, `17 References 4` and `17 References 10`, while ADR 4 and ADR 10 still say "Referenced by". In the JSON, three links have no partner for that reason. The Markdown states 22 references and one amendment, each from both sides; the JSON carries 43 links.
- **Public sets often state one side.** In apache/james-project, ADR 25 `Supercedes` ADR 14, and ADR 14 says nothing back. In alphagov/govuk-aws, ADR 4 says `Superseded by` ADR 15, and ADR 15 says nothing back. James also mixes spellings within a single pair: ADR 26 says `Superseded by` and ADR 35 says `Supercedes`.

## Wordings seen in the wild

Status-section wordings that the adr-tools importer would keep, from the sample below:

| Wording | Where | Kind for the decision graph |
| --- | --- | --- |
| `Supercedes`, `Superceded by` | adr-tools default, James (4) | supersede |
| `Superseded by`, `superseded by`, `Supersedes` | govuk-aws, James, Log4brains | supersede |
| `⌛️ Superseded` | modernisation-platform | supersede |
| `Amends`, `Amended by` | adr-tools README, govuk-aws, Renderizr | amend |
| `References`, `Referenced by` | Renderizr | reference |
| `Links to` | every MADR link | reference |
| `Relates to`, `Requires`, `Completes`, `Complements`, `Complemented by`, `Provides an alternative to`, `An alternative is proposed in`, `Proposes a simple way to implement an alternative to ` (trailing space included) | James | reference |
| `Overrides`, `Overridden by` | James | reference by the map's rule, though it reads as a supersession |
| `of`, `SDK outlined in` | James, cosmos-sdk (sentence fragments the pattern catches) | reference |

What this means for classification:

- Match on the wording, trimmed and case-insensitive: `/super[sc]ed/` is a supersede and `/amend/` is an amend. Everything else, including empty and fragment wordings, counts as a reference. That covers every supersede and amend wording in the sample, both spellings and Log4brains' lower case.
- Read the direction from the decision order. A known pair carries "by" on the older side, but an unknown wording says nothing about direction, and every link points back in time anyway.
- Merge the two sides into one edge per pair of decisions. When the sides disagree on the kind (one says `Supercedes`, the other says nothing or `Relates to`), take the stronger kind: supersede, then amend, then reference.
- Expect status text and links to disagree. A superseded MADR decision has the word in `status` and no supersede link at all.

## How large decision sets get

One folder is one `!adrs` import, so a folder is the unit the decision graph draws. Counts include only numbered decision files, not templates or READMEs. "Kept links" is what the adr-tools importer would keep from the Status section; "any links" counts every distinct Markdown link to another decision anywhere in the file, which bounds what the MADR importer would keep.

| Repo and folder | Commit | Format | Decisions | Kept links per decision (max) | Any links per decision (max) | Decisions with no link at all | Highest number of linked decisions |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [npryce/adr-tools](https://github.com/npryce/adr-tools/tree/b3279baf9be2207d1a4f4bbd608fd0b591c72aee/doc/adr) `doc/adr` | `b3279ba` | adr-tools | 9 | 0.22 (1) | 0.22 (1) | 7 | 1 |
| [thomvaill/log4brains](https://github.com/thomvaill/log4brains/tree/17e32021a8c5/docs/adr) `docs/adr` | `17e3202` | Log4brains | 11 | 0 | 0.27 (1) | 7 | 1 |
| [backstage/backstage](https://github.com/backstage/backstage/tree/75128025b788/docs/architecture-decisions) `docs/architecture-decisions` | `7512802` | custom | 16 | 0 | 0.25 (1) | 11 | 2 |
| [adr/madr](https://github.com/adr/madr/tree/ba75bb1b20d4/docs/decisions) `docs/decisions` | `ba75bb1` | MADR | 19 | 0 | 0.16 (1) | 16 | 2 |
| [home-assistant/architecture](https://github.com/home-assistant/architecture/tree/f4e56645d468/adr) `adr` | `f4e5664` | adr-tools-like | 22 | 0 (1 lost to `./` paths) | 0.41 (2) | 11 | 4 |
| [alphagov/govuk-infrastructure](https://github.com/alphagov/govuk-infrastructure/tree/669543694aa2/docs/architecture/decisions) `docs/architecture/decisions` | `6695436` | adr-tools | 25 | 0 | 0.44 (3) | 16 | 5 |
| [simpledotorg/simple-server](https://github.com/simpledotorg/simple-server/tree/1a0bb6046980/doc/arch) `doc/arch` | `1a0bb60` | adr-tools-like, three-digit names | 25 | 0.04 (1) | 0.44 (4) | 12 | 4 |
| [alphagov/govuk-aws](https://github.com/alphagov/govuk-aws/tree/81ee9f6e91fd/docs/architecture/decisions) `docs/architecture/decisions` | `81ee9f6` | adr-tools | 38 | 0.08 (1) | 0.13 (1) | 32 | 1 |
| [ministryofjustice/modernisation-platform](https://github.com/ministryofjustice/modernisation-platform/tree/37d9dbcb1a93/architecture-decision-record) `architecture-decision-record` | `37d9dbc` | adr-tools | 45 | 0.02 (1) | 0.09 (1) | 39 | 3 |
| [mozilla/fxa](https://github.com/mozilla/fxa/tree/c0eaf503ce30/docs/adr) `docs/adr` | `c0eaf50` | MADR | 52 | not measured | not measured | not measured | not measured |
| [cosmos/cosmos-sdk](https://github.com/cosmos/cosmos-sdk/tree/2ad20ad7ca84/docs/architecture) `docs/architecture` | `2ad20ad` | custom, `adr-NNN` names | 62 | 0.02 (1) | 0.76 (6) | 26 | 9 |
| [cometbft/cometbft](https://github.com/cometbft/cometbft/tree/65c54ed444bd/docs/references/architecture/tendermint-core) `docs/references/architecture/tendermint-core` | `65c54ed` | custom, `adr-NNN` names | 74 | 0.04 (1) | 0.19 (2) | 54 | 2 |
| [apache/james-project](https://github.com/apache/james-project/tree/6aa73cd65557/src/adr) `src/adr` | `6aa73cd` | adr-tools | 78 | 0.21 (2) | 0.64 (10) | 34 | 10 |
| Renderizr `architecture/decisions` | `76cfb99` | adr-tools | 19 | 2.26 (7) | 2.42 (7) | 1 | 7 |

Two more data points: cometbft keeps 19 more decisions in a sibling folder (93 in all), and [openedx/openedx-platform](https://github.com/openedx/openedx-platform/tree/bf699a513a29) spreads 126 decisions over 32 `docs/decisions` folders in reStructuredText, which no Structurizr importer reads.

What this means for scale:

- **Typical:** 10 to 50 decisions in a folder. **Large:** 60 to 80. The biggest single folder in the sample holds 78. Design for 100 and make sure a few hundred still render and scroll.
- **Links are sparse.** In public sets, between 0 and 0.22 links per decision reach the workspace JSON, and most decisions carry none. The decision graph will mostly draw lone dots, with a few short lanes; only Renderizr-style sets that state every reference fill the gutter with lanes.
- **Hubs exist.** Counting every link in the body, one decision ties to up to 10 others (James) or 9 (cosmos-sdk). A MADR workspace keeps every one of those as `Links to`, so a MADR hub can open a long reference lane.

## Method

- Read the importer sources and their tests in structurizr/structurizr at `da99caf`, and the adr-tools scripts at `b3279ba`.
- Compared `architecture/decisions/*.md` with `architecture/workspace.json` at `76cfb99` by replaying the adr-tools pattern over each Status section.
- Picked public repos known to keep ADRs in adr-tools, MADR, Log4brains or similar shapes, sparse-cloned each ADR folder and counted numbered decision files. Counted kept links with the adr-tools importer's pattern and rules (Status section only, bare filename, first link per target), and any links with a non-greedy Markdown link pattern over the whole file. fxa's count comes from the GitHub tree API; its folder failed to check out.
