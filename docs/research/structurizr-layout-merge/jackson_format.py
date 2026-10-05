#!/usr/bin/env python3
"""Re-serialize JSON the way Structurizr's Jackson writer pretty-prints it.

Parses each file (keeping key order), prints it with the rules of Jackson's
DefaultPrettyPrinter (two-space indent, `"key" : value`, inline arrays,
`{ }` and `[ ]` for empty containers, no trailing newline) and reports whether
the result matches the original bytes.

Usage: jackson_format.py <file.json> [...]
"""

import json
import sys


def string(value):
    out = ['"']
    for char in value:
        code = ord(char)
        if char == '"':
            out.append('\\"')
        elif char == "\\":
            out.append("\\\\")
        elif char == "\n":
            out.append("\\n")
        elif char == "\r":
            out.append("\\r")
        elif char == "\t":
            out.append("\\t")
        elif char == "\b":
            out.append("\\b")
        elif char == "\f":
            out.append("\\f")
        elif code < 0x20:
            out.append(f"\\u{code:04X}")
        else:
            out.append(char)
    out.append('"')
    return "".join(out)


def pretty(value, nesting=0, newline="\n"):
    if isinstance(value, dict):
        if not value:
            return "{ }"
        inner = nesting + 1
        pad = newline + "  " * inner
        entries = [f"{string(key)} : {pretty(item, inner, newline)}" for key, item in value.items()]
        return "{" + pad + ("," + pad).join(entries) + newline + "  " * nesting + "}"
    if isinstance(value, list):
        if not value:
            return "[ ]"
        return "[ " + ", ".join(pretty(item, nesting, newline) for item in value) + " ]"
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    if isinstance(value, str):
        return string(value)
    return json.dumps(value)


def main():
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as handle:
            original = handle.read()
        rebuilt = pretty(json.loads(original))
        status = "identical" if rebuilt == original else "differs"
        print(f"{status}: {path} ({len(original.encode('utf-8'))} bytes)")


if __name__ == "__main__":
    main()
