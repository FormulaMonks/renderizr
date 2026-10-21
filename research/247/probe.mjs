// Feeds each pointer form to Renderizr's classifyLink, against a stand-in
// model with one view "SystemLandscape" and no documents.
const { classifyLink } = await import(process.argv[2]);

const model = {
    getViews: () => [{ key: "SystemLandscape" }],
    getTitleForView: (v) => `View ${v.key}`,
    documentation: { sections: [], decisions: [] },
};

const links = [
    "{workspace:1}/diagrams",
    "{workspace:1}/diagrams#SystemLandscape",
    "{workspace}/diagrams#SystemLandscape",
    "https://structurizr.com/workspace/1/diagrams",
    "https://structurizr.com/workspace/1/diagrams#SystemLandscape",
    "https://structurizr.example.com/workspace/1/diagrams#SystemLandscape",
    "/workspace/1/diagrams",
];
for (const link of links) {
    console.log(
        JSON.stringify(link),
        "->",
        JSON.stringify(classifyLink(model, link)),
    );
}
