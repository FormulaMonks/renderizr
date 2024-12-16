#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { existsSync, writeFileSync } from "node:fs";

const renderWorkspace = (path) => {
    const realpath = resolve(path);

    if (existsSync(realpath)) {
        console.log(`Rendering workspace: ${realpath}`);
        const content = `
workspace extends ${relative(dirname(realpath), realpath)} {
    !script groovy {
        def graphviz = new com.structurizr.autolayout.graphviz.GraphvizAutomaticLayout();
        graphviz.setRankDirection(com.structurizr.autolayout.graphviz.RankDirection.valueOf("LeftRight"));
        graphviz.apply(workspace);
    }
}`;

        const graphvizDslPath = `${dirname(realpath)}/graphviz.dsl`;
        writeFileSync(graphvizDslPath, content);

        execSync(
            `structurizr-cli export -w ${graphvizDslPath} -f json -o ${dirname(realpath)}`,
        );
        execSync(
            `mv ${dirname(realpath)}/graphviz.json ${dirname(realpath)}/workspace.json`,
        );
    } else {
        console.log(`Workspace ${path} not found locally`);
    }
};

// Example usage
const path = process.argv[2];
if (path) {
    renderWorkspace(path);
} else {
    console.log("Please provide a path to the workspace.");
}
