import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
    ReactFlow,
    Background,
    Controls,
    useReactFlow,
    ReactFlowProvider,
    useNodesInitialized,
    useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const nodes = [
    { id: "a", position: { x: 0, y: 0 }, data: { label: "Web App" } },
    { id: "b", position: { x: 250, y: 120 }, data: { label: "Database" } },
];
const edges = [{ id: "a-b", source: "a", target: "b", label: "reads from" }];

// Everything observable is written into the DOM so `--dump-dom` can read it.
const report = (key, value) => {
    const pre = document.getElementById("report");
    const log = JSON.parse(pre.textContent || "{}");
    log[key] = value;
    pre.textContent = JSON.stringify(log, null, 1);
};
window.__report = report;

const errors = [];

function Probe({ tag }) {
    const { getViewport } = useReactFlow();
    const initialized = useNodesInitialized();
    const size = useStore((s) => [s.width, s.height]);
    useEffect(() => {
        const target = document.getElementById("structurizr-diagram-target");
        report(`${tag}:probe:${performance.now().toFixed(0)}`, {
            initialized,
            storeSize: size,
            containerSize: [target.clientWidth, target.clientHeight],
            viewport: getViewport(),
            errors: [...errors],
        });
    }, [tag, getViewport, initialized, size[0], size[1]]);
    return null;
}

function Island({ tag }) {
    return (
        <ReactFlowProvider>
            <ReactFlow
                defaultNodes={nodes}
                defaultEdges={edges}
                fitView
                onError={(code, message) => errors.push(`${code}: ${message}`)}
            >
                <Background />
                <Controls />
            </ReactFlow>
            <Probe tag={tag} />
        </ReactFlowProvider>
    );
}

const target = document.getElementById("structurizr-diagram-target");
const scenario = document.body.dataset.scenario || "plain";

window.addEventListener("error", (event) =>
    report(`window.error:${Date.now()}`, String(event.message)),
);
document.addEventListener("securitypolicyviolation", (event) =>
    report(`csp:${event.violatedDirective}:${Date.now()}`, {
        blocked: event.blockedURI,
        sample: event.sample,
        source: `${event.sourceFile}:${event.lineNumber}`,
    }),
);

let root = createRoot(target);
root.render(
    <StrictMode>
        <Island tag="mount1" />
    </StrictMode>,
);
report("scenario", scenario);
report("initialStyle", target.getAttribute("style"));

if (scenario === "zero" || scenario === "hidden") {
    // The container starts without a size (0x0, or display:none); the island
    // mounts into it; then the container gets a size, as a Claude artifact's
    // viewport does once the host puts the page on screen.
    setTimeout(() => {
        target.style.cssText = "width:640px;height:400px;display:block";
        report("resizedAt", performance.now().toFixed(0));
    }, 1200);
    setTimeout(() => {
        const vp = document.querySelector(".react-flow__viewport");
        const nodeEls = [...document.querySelectorAll(".react-flow__node")];
        report("after", {
            viewportTransform: vp?.style.transform ?? null,
            nodeTransforms: nodeEls.map((n) => n.style.transform),
            nodeMeasured: nodeEls.map((n) => [n.offsetWidth, n.offsetHeight]),
            errors,
        });
    }, 3000);
}

if (scenario === "remount") {
    // What the hash router does: tear the page down, build it again, several
    // times — once with root.unmount() and once by only wiping innerHTML.
    setTimeout(() => {
        root.unmount();
        report("afterUnmount", {
            flowElements: document.querySelectorAll(".react-flow").length,
            containerChildren: target.childNodes.length,
        });
        root = createRoot(target);
        root.render(
            <StrictMode>
                <Island tag="mount2" />
            </StrictMode>,
        );
    }, 800);
    setTimeout(() => {
        // The anti-pattern: wipe the DOM without unmounting, then create a new root.
        target.innerHTML = "";
        let threw = null;
        try {
            root = createRoot(target);
            root.render(
                <StrictMode>
                    <Island tag="mount3" />
                </StrictMode>,
            );
        } catch (e) {
            threw = String(e);
        }
        report("afterInnerHTMLWipe", { threw });
    }, 1600);
    setTimeout(() => {
        report("final", {
            flowElements: document.querySelectorAll(".react-flow").length,
            nodeElements: document.querySelectorAll(".react-flow__node").length,
            errors,
        });
    }, 2600);
}

if (scenario === "plain" || scenario === "csp") {
    setTimeout(() => {
        const vp = document.querySelector(".react-flow__viewport");
        const nodeEls = [...document.querySelectorAll(".react-flow__node")];
        report("after", {
            viewportTransform: vp?.style.transform ?? null,
            nodeTransforms: nodeEls.map((n) => n.style.transform),
            nodeMeasured: nodeEls.map((n) => [n.offsetWidth, n.offsetHeight]),
            edges: document.querySelectorAll(".react-flow__edge").length,
            styleElements: document.querySelectorAll("style").length,
            errors,
        });
    }, 1500);
}
