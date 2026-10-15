// Sample sources for the three Mermaid types, each with frontmatter or an %%{init}%% directive.
export const flowchart = `---
title: Checkout
config:
  flowchart:
    curve: linear
    nodeSpacing: 40
  themeVariables:
    primaryColor: "#ff6600"
    fontFamily: Inter
---
%%{init: {"theme": "base", "flowchart": {"rankSpacing": 70}}}%%
flowchart LR
  A[Cart] -->|pay| B{Valid?}
  B -- yes --> C([Receipt])
  B -. no .-> D[(Errors)]
  subgraph S [Shop]
    C
  end
  classDef warn fill:#f96,stroke:#333
  class D warn
  style A fill:#bbf
  click A href "https://example.com" "Open cart"
  click B callback
`;

export const erd = `---
config:
  er:
    layoutDirection: LR
---
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string name PK "the name"
    int age
  }
`;

export const sequence = `%%{init: {"sequence": {"mirrorActors": false, "showSequenceNumbers": true}}}%%
sequenceDiagram
  actor U as User
  participant W as Web
  U->>+W: GET /
  loop every minute
    W-->>U: ping
  end
  alt ok
    W->>U: 200
  else fail
    W-xU: 500
  end
  Note over U,W: done
  W-->>-U: bye
`;

export const broken = `flowchart LR
  A -->
  B[[`;
