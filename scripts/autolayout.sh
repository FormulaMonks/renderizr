#!/bin/bash

# This script renders a workspace using the Graphviz automatic layout
# Use this only when you haven't used Structurizr/Lite to render the workspace

path="$1"
realpath=$(grealpath "$path")

if [ -f "$realpath" ]; then
    echo "Rendering workspace: $realpath"
    content="""
workspace extends $(grealpath "$realpath" --relative-to="$(dirname "$realpath")") {
    !script groovy {
        def graphviz = new com.structurizr.autolayout.graphviz.GraphvizAutomaticLayout();
        graphviz.setRankDirection(com.structurizr.autolayout.graphviz.RankDirection.valueOf(\"LeftRight\"));
        graphviz.apply(workspace);
    }
}"""

    echo "$content" > "$(dirname "$realpath")"/graphviz.dsl
    structurizr-cli export -w "$(dirname "$realpath")"/graphviz.dsl -f json -o "$(dirname "$realpath")"
    mv "$(dirname "$realpath")"/graphviz.json "$(dirname "$realpath")"/workspace.json
else
    echo "Workspace $path not found locally"
fi