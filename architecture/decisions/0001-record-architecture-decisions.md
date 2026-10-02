# 1. Record architecture decisions

Date: 2026-10-02

## Status

Accepted

## Context

Renderizr's design decisions have lived in pull requests, issues and code comments. Replacing the diagram engine involves several choices that are hard to reverse and would puzzle a reader who only sees the code.

## Decision

Record architecture decisions as ADRs in `architecture/decisions/`, in the adr-tools format, so `!adrs decisions` in `architecture/workspace.dsl` imports them into Renderizr's own architecture site. Write an ADR when a decision is hard to reverse, surprising without context, and the result of a real trade-off.

## Consequences

- Each ADR is a numbered file (`NNNN-kebab-title.md`) with a `# N. Title` heading, a `Date:` line and `Status`, `Context`, `Decision` and `Consequences` sections, which is the shape Structurizr's importer parses.
- A superseded ADR stays in place, with its status pointing at the ADR that replaces it.

## Reference links

- [adr-tools](https://github.com/npryce/adr-tools)
- [Structurizr DSL `!adrs`](https://docs.structurizr.com/dsl/adrs)
