#!/usr/bin/env python3
"""Probe how Structurizr's `export` and `merge` treat layout, on scratch copies.

Exports variants of the acceptance workspace.dsl with the Structurizr CLI,
merges an edited layout into each and prints what every merge keeps. The CLI is
STRUCTURIZR_CLI, or structurizr-cli on the PATH; set JAVA_HOME to pick the JVM.
Everything it writes goes under the scratch directory, which it empties first.

Usage: merge_experiments.py <acceptance workspace.dsl> <scratch directory>
"""

import copy
import json
import os
import re
import shutil
import subprocess
import sys

CLI = os.environ.get("STRUCTURIZR_CLI", "structurizr-cli")


def run(args):
    result = subprocess.run([CLI, *args], capture_output=True, text=True)
    return result.returncode, result.stdout + result.stderr


def export(dsl_text, directory):
    os.makedirs(directory, exist_ok=True)
    dsl_path = os.path.join(directory, "workspace.dsl")
    with open(dsl_path, "w", encoding="utf-8") as handle:
        handle.write(dsl_text)
    out = os.path.join(directory, "export")
    code, log = run(["export", "-w", dsl_path, "-f", "json", "-o", out])
    if code != 0:
        raise SystemExit(f"export failed in {directory}:\n{log}")
    with open(os.path.join(out, "workspace.json"), encoding="utf-8") as handle:
        return dsl_path, json.load(handle)


def merge(dsl_path, layout_path, out_path, view=None):
    args = ["merge", "-w", dsl_path, "-l", layout_path, "-o", out_path]
    if view:
        args += ["-v", view]
    code, log = run(args)
    if code != 0:
        raise SystemExit(f"merge failed:\n{log}")
    with open(out_path, encoding="utf-8") as handle:
        return json.load(handle), log


def elements_by_identifier(workspace):
    found = {}

    def visit(node):
        if isinstance(node, dict):
            identifier = node.get("properties", {}).get("structurizr.dsl.identifier")
            if identifier and "id" in node:
                found[identifier] = node
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(workspace["model"])
    return found


def relationships_by_id(workspace):
    found = {}

    def visit(node):
        if isinstance(node, dict):
            if "sourceId" in node and "destinationId" in node:
                found[node["id"]] = node
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)

    visit(workspace["model"])
    return found


def all_views(workspace):
    views = workspace["views"]
    for key, value in views.items():
        if isinstance(value, list):
            for view in value:
                yield view


def view(workspace, key):
    for candidate in all_views(workspace):
        if candidate.get("key") == key:
            return candidate
    return None


def element_xy(workspace, key, identifier):
    element = elements_by_identifier(workspace).get(identifier)
    target = view(workspace, key)
    if element is None or target is None:
        return None
    for element_view in target.get("elements", []):
        if element_view["id"] == element["id"]:
            return (element_view.get("x"), element_view.get("y"))
    return None


def set_element_xy(workspace, key, identifier, x, y):
    element = elements_by_identifier(workspace)[identifier]
    for element_view in view(workspace, key)["elements"]:
        if element_view["id"] == element["id"]:
            element_view["x"] = x
            element_view["y"] = y
            return element_view
    raise KeyError(identifier)


def relationship_view(workspace, key, source, destination):
    elements = elements_by_identifier(workspace)
    relationships = relationships_by_id(workspace)
    source_id = elements[source]["id"]
    destination_id = elements[destination]["id"]
    for rel_view in view(workspace, key).get("relationships", []):
        rel = relationships.get(rel_view["id"])
        if rel and rel["sourceId"] == source_id and rel["destinationId"] == destination_id:
            return rel_view
    return None


def layout_of(rel_view):
    if rel_view is None:
        return None
    return {k: rel_view[k] for k in ("vertices", "routing", "position", "jump") if k in rel_view}


def report(title, lines):
    print(f"\n## {title}")
    for line in lines:
        print(f"- {line}")


def main():
    dsl_source, scratch = sys.argv[1], sys.argv[2]
    shutil.rmtree(scratch, ignore_errors=True)
    os.makedirs(scratch)
    with open(dsl_source, encoding="utf-8") as handle:
        base_dsl = handle.read()

    code, log = run(["version"])
    print(re.sub(r" \(/[^)]*\)", "", log.strip()))

    # E0: the export of the unchanged DSL.
    base_dsl_path, base = export(base_dsl, os.path.join(scratch, "e0-base"))

    # E1: change layout values in a copy of the export, then merge it back into the DSL.
    layout = copy.deepcopy(base)
    set_element_xy(layout, "Landscape", "customer", 111, 888)
    set_element_xy(layout, "Landscape", "warehouse", 1850, 150)
    set_element_xy(layout, "Landscape", "payments", 2750, 850)
    set_element_xy(layout, "Deployment", "webInstance", 300, 300)
    set_element_xy(layout, "Containers", "queue", 1900, 700)
    set_element_xy(layout, "Shapes", "box", 120, 100)
    set_element_xy(layout, "LandscapeAutomatic", "customer", 500, 500)
    rel = relationship_view(layout, "Landscape", "shop", "warehouse")
    rel.update({"vertices": [{"x": 1500, "y": 500}, {"x": 1600, "y": 500}], "routing": "Curved", "position": 30, "jump": True})
    relationship_view(layout, "Landscape", "warehouse", "courier")["vertices"] = []
    landscape = view(layout, "Landscape")
    landscape["paperSize"] = "A3_Landscape"
    landscape["dimensions"] = {"width": 3500, "height": 2000}
    # fields Structurizr does not define
    landscape["elements"][0]["width"] = 400
    relationship_view(layout, "Landscape", "customer", "shop")["side"] = "left"
    layout["views"]["configuration"]["lastSavedView"] = "Containers"
    # drop courier from the layout's Landscape view, as if the layout predates it
    courier_id = elements_by_identifier(layout)["courier"]["id"]
    landscape["elements"] = [ev for ev in landscape["elements"] if ev["id"] != courier_id]
    layout_path = os.path.join(scratch, "layout.json")
    with open(layout_path, "w", encoding="utf-8") as handle:
        json.dump(layout, handle, indent=2)

    merged, log = merge(base_dsl_path, layout_path, os.path.join(scratch, "e1-merged.json"))
    merged_landscape = view(merged, "Landscape")
    report("E1 merge of an edited layout into the unchanged DSL", [
        f"Landscape customer: export {element_xy(base, 'Landscape', 'customer')}, layout (111, 888), merged {element_xy(merged, 'Landscape', 'customer')}",
        f"Landscape courier (absent from layout): export {element_xy(base, 'Landscape', 'courier')}, merged {element_xy(merged, 'Landscape', 'courier')}",
        f"Containers queue: export {element_xy(base, 'Containers', 'queue')}, layout (1900, 700), merged {element_xy(merged, 'Containers', 'queue')}",
        f"Shapes box: export {element_xy(base, 'Shapes', 'box')}, layout (120, 100), merged {element_xy(merged, 'Shapes', 'box')}",
        f"LandscapeAutomatic customer: layout (500, 500), merged {element_xy(merged, 'LandscapeAutomatic', 'customer')}",
        f"shop->warehouse: export {layout_of(relationship_view(base, 'Landscape', 'shop', 'warehouse'))}, merged {layout_of(relationship_view(merged, 'Landscape', 'shop', 'warehouse'))}",
        f"warehouse->courier (layout vertices emptied, courier unmatched): export {layout_of(relationship_view(base, 'Landscape', 'warehouse', 'courier'))}, merged {layout_of(relationship_view(merged, 'Landscape', 'warehouse', 'courier'))}",
        f"payments->customer (untouched): merged {layout_of(relationship_view(merged, 'Landscape', 'payments', 'customer'))}",
        f"Landscape paperSize {merged_landscape.get('paperSize')}, dimensions {merged_landscape.get('dimensions')}",
        f"unknown element-view key 'width' kept: {any('width' in ev for ev in merged_landscape['elements'])}",
        f"unknown relationship-view key 'side' kept: {any('side' in rv for rv in merged_landscape.get('relationships', []))}",
        f"lastSavedView: {merged['views'].get('configuration', {}).get('lastSavedView')}",
        "log: " + " | ".join(line.strip() for line in log.splitlines() if "layout information" in line.lower() and "no layout" in line.lower()),
    ])

    # E1b: the same merge restricted to one view with -v.
    merged_one, _ = merge(base_dsl_path, layout_path, os.path.join(scratch, "e1b-merged-view.json"), view="Containers")
    report("E1b merge -v Containers", [
        f"Containers queue {element_xy(merged_one, 'Containers', 'queue')}, Landscape customer {element_xy(merged_one, 'Landscape', 'customer')}",
        f"lastSavedView: {merged_one['views'].get('configuration', {}).get('lastSavedView')}",
    ])

    def variant(name, replacements, extra_script=""):
        text = base_dsl
        for old, new in replacements:
            if old not in text:
                raise SystemExit(f"{name}: '{old}' not found in the DSL")
            text = text.replace(old, new, 1)
        if extra_script:
            marker = "        place(\"Styles\", ["
            text = text.replace(marker, extra_script + "\n" + marker, 1)
        directory = os.path.join(scratch, name)
        dsl_path, exported = export(text, directory)
        result, log = merge(dsl_path, layout_path, os.path.join(directory, "merged.json"))
        warnings = [line.strip() for line in log.splitlines() if "no layout information" in line.lower()]
        return exported, result, warnings

    # E2: rename an element, keep its description.
    exported, result, warnings = variant("e2-rename", [('softwareSystem "Warehouse"', 'softwareSystem "Fulfilment"')])
    report("E2 rename Warehouse to Fulfilment (description unchanged)", [
        f"Landscape warehouse: layout {element_xy(layout, 'Landscape', 'warehouse')}, merged {element_xy(result, 'Landscape', 'warehouse')}",
        f"shop->warehouse vertices kept: {layout_of(relationship_view(result, 'Landscape', 'shop', 'warehouse'))}",
        f"warnings: {warnings}",
    ])

    # E3: rename and redescribe an element, ids unchanged.
    exported, result, warnings = variant("e3-rename-redescribe", [
        ('softwareSystem "Card\\ngateway" "Charges cards"', 'softwareSystem "Payments" "Takes card payments"'),
    ])
    report("E3 rename and redescribe Card gateway (same id)", [
        f"Landscape payments: layout {element_xy(layout, 'Landscape', 'payments')}, merged {element_xy(result, 'Landscape', 'payments')}",
        f"warnings: {warnings}",
    ])

    # E4: rename and redescribe an element after inserting a new element above it (ids shift).
    exported, result, warnings = variant("e4-rename-redescribe-shift", [
        ('        customer = person "Customer"', '        auditor = person "Auditor" "Checks the books"\n        customer = person "Customer"'),
        ('softwareSystem "Card\\ngateway" "Charges cards"', 'softwareSystem "Payments" "Takes card payments"'),
    ])
    report("E4 insert an element first, then rename and redescribe Card gateway (ids shift)", [
        f"payments id: layout {elements_by_identifier(layout)['payments']['id']}, variant {elements_by_identifier(result)['payments']['id']}",
        f"Landscape payments: layout {element_xy(layout, 'Landscape', 'payments')}, script {element_xy(exported, 'Landscape', 'payments')}, merged {element_xy(result, 'Landscape', 'payments')}",
        f"Landscape customer (canonical name unchanged): layout {element_xy(layout, 'Landscape', 'customer')}, merged {element_xy(result, 'Landscape', 'customer')}",
        f"warnings: {warnings}",
    ])

    # E4b: the E4 DSL against the unchanged export, where Courier still sits in the Landscape view.
    e4_dsl = os.path.join(scratch, "e4-rename-redescribe-shift", "workspace.dsl")
    base_export = os.path.join(scratch, "e0-base", "export", "workspace.json")
    result, log = merge(e4_dsl, base_export, os.path.join(scratch, "e4b-merged.json"))
    report("E4b E4 merged with the unchanged export (Courier present)", [
        f"ids: payments {elements_by_identifier(base)['payments']['id']} -> {elements_by_identifier(result)['payments']['id']}, courier {elements_by_identifier(base)['courier']['id']} -> {elements_by_identifier(result)['courier']['id']}",
        f"Landscape payments: export {element_xy(base, 'Landscape', 'payments')}, merged {element_xy(result, 'Landscape', 'payments')}",
        f"Landscape courier: export {element_xy(base, 'Landscape', 'courier')}, merged {element_xy(result, 'Landscape', 'courier')}",
        "warnings: " + str([line.strip() for line in log.splitlines() if "no layout information" in line.lower()]),
    ])

    # E5: same as E4 without the !script block, so unmatched elements have no fallback position.
    no_script = base_dsl[: base_dsl.index("    !script groovy {")] + "}\n"
    dsl_text = no_script.replace('        customer = person "Customer"', '        auditor = person "Auditor" "Checks the books"\n        customer = person "Customer"', 1)
    dsl_text = dsl_text.replace('softwareSystem "Card\\ngateway" "Charges cards"', 'softwareSystem "Payments" "Takes card payments"', 1)
    directory = os.path.join(scratch, "e5-no-script")
    dsl_path, exported = export(dsl_text, directory)
    result, log = merge(dsl_path, layout_path, os.path.join(directory, "merged.json"))
    report("E5 E4 without the !script block", [
        f"Landscape payments: export {element_xy(exported, 'Landscape', 'payments')}, merged {element_xy(result, 'Landscape', 'payments')}",
        f"Landscape customer: export {element_xy(exported, 'Landscape', 'customer')}, merged {element_xy(result, 'Landscape', 'customer')}",
        f"Landscape courier (absent from layout): merged {element_xy(result, 'Landscape', 'courier')}",
    ])

    # E6: move a container instance to another deployment node (re-parent; canonical name changes).
    exported, result, warnings = variant("e6-reparent", [
        ("                webServer = deploymentNode \"Web server\" \"\" \"nginx\" {\n                    webInstance = containerInstance web\n                }\n",
         "                webServer = deploymentNode \"Web server\" \"\" \"nginx\"\n"),
        ("                    apiInstance = containerInstance api\n",
         "                    apiInstance = containerInstance api\n                    webInstance = containerInstance web\n"),
    ])
    report("E6 move webInstance from Web server to API server", [
        f"Deployment webInstance: layout {element_xy(layout, 'Deployment', 'webInstance')}, script {element_xy(exported, 'Deployment', 'webInstance')}, merged {element_xy(result, 'Deployment', 'webInstance')}",
        f"warnings: {warnings}",
    ])

    # E7: rename the parent of containers (every child's canonical name changes).
    exported, result, warnings = variant("e7-rename-parent", [('softwareSystem "Shop"', 'softwareSystem "Store"')])
    report("E7 rename Shop to Store (children's canonical names change)", [
        f"Containers queue: layout {element_xy(layout, 'Containers', 'queue')}, merged {element_xy(result, 'Containers', 'queue')}",
        f"Containers api: layout {element_xy(layout, 'Containers', 'api')}, merged {element_xy(result, 'Containers', 'api')}",
        f"warnings: {warnings}",
    ])

    # E8: change a view key, keep its description; then change both.
    exported, result, warnings = variant("e8-view-key", [
        ('container shop "Containers"', 'container shop "ContainerView"'),
        ('place("Containers", [', 'place("ContainerView", ['),
    ])
    merged_view = view(result, "ContainerView")
    queue_id = elements_by_identifier(result)["queue"]["id"]
    queue_xy = [(ev.get("x"), ev.get("y")) for ev in merged_view["elements"] if ev["id"] == queue_id]
    exported2, result2, _ = variant("e8b-view-key-description", [
        ('container shop "Containers" "A stored layout that leaves the queue unplaced"', 'container shop "ContainerView" "The containers"'),
        ('place("Containers", [', 'place("ContainerView", ['),
    ])
    merged_view2 = view(result2, "ContainerView")
    queue_xy2 = [(ev.get("x"), ev.get("y")) for ev in merged_view2["elements"] if ev["id"] == queue_id]
    report("E8 rename the Containers view key", [
        f"key changed, description kept: queue {queue_xy} (layout had (1900, 700))",
        f"key and description changed: queue {queue_xy2}",
    ])

    # E9: change a relationship description (falls back to matching by id).
    exported, result, warnings = variant("e9-relationship-description", [('shop -> warehouse "Sends orders to"', 'shop -> warehouse "Hands orders to"')])
    report("E9 change the description of shop -> warehouse", [
        f"merged {layout_of(relationship_view(result, 'Landscape', 'shop', 'warehouse'))}",
    ])

    # E10: the script changes a coordinate the layout already holds, and places an element the layout lacks.
    exported, result, warnings = variant("e10-script-vs-layout", [
        ('customer: [100, 800], clerk: [1000, 100]', 'customer: [150, 850], clerk: [1000, 100]'),
        ('        clerk -> warehouse "Packs orders in" "" "Orthogonal"', '        clerk -> warehouse "Packs orders in" "" "Orthogonal"\n        returns = softwareSystem "Returns" "Takes parcels back"\n        customer -> returns "Sends parcels to"'),
        ('        include customer clerk shop warehouse payments courier\n        }\n\n        systemLandscape "LandscapeAutomatic"', '        include customer clerk shop warehouse payments courier returns\n        }\n\n        systemLandscape "LandscapeAutomatic"'),
    ], extra_script="""        place("Landscape", [returns: [100, 100]])
        place("Containers", [queue: [1500, 700]])
        workspace.views.getViewWithKey("Landscape").getRelationshipView(workspace.model.relationships.find({ it.source == lookup("customer") && it.destination == lookup("shop") })).setRouting(com.structurizr.view.Routing.Curved)
        workspace.views.getViewWithKey("Landscape").getRelationshipView(workspace.model.relationships.find({ it.source == lookup("customer") && it.destination == lookup("shop") })).setPosition(70)""")
    report("E10 script changes vs. the layout", [
        f"Landscape customer: script {element_xy(exported, 'Landscape', 'customer')}, layout {element_xy(layout, 'Landscape', 'customer')}, merged {element_xy(result, 'Landscape', 'customer')}",
        f"Landscape returns (not in layout): script {element_xy(exported, 'Landscape', 'returns')}, merged {element_xy(result, 'Landscape', 'returns')}",
        f"Containers queue: script {element_xy(exported, 'Containers', 'queue')}, layout {element_xy(layout, 'Containers', 'queue')}, merged {element_xy(result, 'Containers', 'queue')}",
        f"customer->shop: script {layout_of(relationship_view(exported, 'Landscape', 'customer', 'shop'))}, layout {layout_of(relationship_view(layout, 'Landscape', 'customer', 'shop'))}, merged {layout_of(relationship_view(result, 'Landscape', 'customer', 'shop'))}",
        f"customer->returns (not in layout): merged {layout_of(relationship_view(result, 'Landscape', 'customer', 'returns'))}",
    ])

    # E11: the script places an element that the layout records as unplaced (0, 0).
    base_layout = copy.deepcopy(base)
    base_layout_path = os.path.join(scratch, "base-layout.json")
    with open(base_layout_path, "w", encoding="utf-8") as handle:
        json.dump(base_layout, handle, indent=2)
    text = base_dsl.replace("        place(\"Styles\", [", "        place(\"Containers\", [queue: [1500, 700]])\n        place(\"Styles\", [", 1)
    directory = os.path.join(scratch, "e11-script-places-unplaced")
    dsl_path, exported = export(text, directory)
    result, _ = merge(dsl_path, base_layout_path, os.path.join(directory, "merged.json"))
    report("E11 script places queue, layout still has it at the origin", [
        f"Containers queue: script {element_xy(exported, 'Containers', 'queue')}, layout {element_xy(base_layout, 'Containers', 'queue')}, merged {element_xy(result, 'Containers', 'queue')}",
    ])

    # E12: the script opts a view out of merging with setMergeFromRemote(false).
    exported, result, warnings = variant("e12-merge-from-remote", [], extra_script="""        workspace.views.getViewWithKey("Shapes").setMergeFromRemote(false)""")
    report("E12 script calls setMergeFromRemote(false) on Shapes", [
        f"Shapes box: script {element_xy(exported, 'Shapes', 'box')}, layout {element_xy(layout, 'Shapes', 'box')}, merged {element_xy(result, 'Shapes', 'box')}",
        f"mergeFromRemote in JSON: {'mergeFromRemote' in view(result, 'Shapes')}",
    ])

    # E13: the DSL drops autoLayout from LandscapeAutomatic, so the layout's coordinates apply.
    exported, result, warnings = variant("e13-drop-autolayout", [
        ('            include customer clerk shop warehouse payments courier\n            autoLayout\n', '            include customer clerk shop warehouse payments courier\n'),
    ])
    report("E13 remove autoLayout from LandscapeAutomatic", [
        f"LandscapeAutomatic customer: layout {element_xy(layout, 'LandscapeAutomatic', 'customer')}, merged {element_xy(result, 'LandscapeAutomatic', 'customer')}",
        f"automaticLayout in merged view: {view(result, 'LandscapeAutomatic').get('automaticLayout')}",
    ])

    # E14: export without -o writes workspace.json beside workspace.dsl.
    directory = os.path.join(scratch, "e14-export-default-output")
    os.makedirs(directory)
    shutil.copy(layout_path, os.path.join(directory, "workspace.json"))
    with open(os.path.join(directory, "workspace.dsl"), "w", encoding="utf-8") as handle:
        handle.write(base_dsl)
    code, log = run(["export", "-w", os.path.join(directory, "workspace.dsl"), "-f", "json"])
    with open(os.path.join(directory, "workspace.json"), encoding="utf-8") as handle:
        after = json.load(handle)
    report("E14 export with no -o", [
        f"exit {code}; Landscape customer in workspace.json beside the DSL: before (111, 888), after {element_xy(after, 'Landscape', 'customer')}",
    ])


if __name__ == "__main__":
    main()
