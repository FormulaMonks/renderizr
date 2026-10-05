#!/usr/bin/env python3
"""Probe how Structurizr reads layout values it does not expect.

Writes one unexpected layout value at a time into a copy of a DSL export,
merges it back into the DSL with the Structurizr CLI and prints what comes out.
Usage: value_experiments.py <scratch runs directory>
(expects runs/e0-base from merge_experiments.py).
"""

import copy
import json
import os
import re
import sys

from merge_experiments import element_xy, layout_of, merge, relationship_view, set_element_xy, view


def probe(runs, base, name, change, read):
    layout = copy.deepcopy(base)
    change(layout)
    path = os.path.join(runs, f"values-{name}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(layout, handle, indent=2)
    try:
        merged, _ = merge(os.path.join(runs, "e0-base", "workspace.dsl"), path, os.path.join(runs, f"values-{name}-merged.json"))
    except SystemExit as error:
        match = re.search(r"(InvalidFormatException|MismatchedInputException|JsonMappingException)[^\n]*", str(error))
        print(f"{name}: merge fails: {match.group(0)[:300] if match else str(error)[-300:]}")
        return
    print(f"{name}: {read(merged)}")


def main():
    runs = sys.argv[1]
    with open(os.path.join(runs, "e0-base", "export", "workspace.json"), encoding="utf-8") as handle:
        base = json.load(handle)

    def rel(layout):
        return relationship_view(layout, "Landscape", "shop", "warehouse")

    def drop_vertices(layout):
        relationship_view(layout, "Landscape", "payments", "customer").pop("vertices", None)

    probe(runs, base, "no-vertices", drop_vertices,
          lambda m: f"payments->customer without vertices in the layout (the script sets two) -> {layout_of(relationship_view(m, 'Landscape', 'payments', 'customer'))}")
    probe(runs, base, "fractional-xy",lambda w: set_element_xy(w, "Landscape", "customer", 100.7, 799.2),
          lambda m: f"x 100.7, y 799.2 -> {element_xy(m, 'Landscape', 'customer')}")
    probe(runs, base, "negative-xy", lambda w: set_element_xy(w, "Landscape", "customer", -40, -10),
          lambda m: f"x -40, y -10 -> {element_xy(m, 'Landscape', 'customer')}")
    probe(runs, base, "string-xy", lambda w: set_element_xy(w, "Landscape", "customer", "120", "820"),
          lambda m: f"x '120', y '820' -> {element_xy(m, 'Landscape', 'customer')}")
    probe(runs, base, "fractional-vertex", lambda w: rel(w).update({"vertices": [{"x": 1500.6, "y": 499.5}]}),
          lambda m: f"vertex (1500.6, 499.5) -> {layout_of(relationship_view(m, 'Landscape', 'shop', 'warehouse'))}")
    probe(runs, base, "unknown-routing", lambda w: rel(w).update({"routing": "Spline"}),
          lambda m: f"routing 'Spline' -> {layout_of(relationship_view(m, 'Landscape', 'shop', 'warehouse'))}")
    probe(runs, base, "position-over", lambda w: rel(w).update({"position": 150}),
          lambda m: f"position 150 -> {layout_of(relationship_view(m, 'Landscape', 'shop', 'warehouse'))}")
    probe(runs, base, "position-under", lambda w: rel(w).update({"position": -5}),
          lambda m: f"position -5 -> {layout_of(relationship_view(m, 'Landscape', 'shop', 'warehouse'))}")
    probe(runs, base, "jump-string", lambda w: rel(w).update({"jump": "yes"}),
          lambda m: f"jump 'yes' -> {layout_of(relationship_view(m, 'Landscape', 'shop', 'warehouse'))}")
    probe(runs, base, "unknown-paper-size", lambda w: view(w, "Landscape").update({"paperSize": "A9_Portrait"}),
          lambda m: f"paperSize 'A9_Portrait' -> {view(m, 'Landscape').get('paperSize')}")
    probe(runs, base, "fractional-dimensions", lambda w: view(w, "Landscape").update({"dimensions": {"width": 3000.9, "height": 1800}}),
          lambda m: f"dimensions (3000.9, 1800) -> {view(m, 'Landscape').get('dimensions')}")


if __name__ == "__main__":
    main()
