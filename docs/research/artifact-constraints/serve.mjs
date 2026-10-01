// Serve dist/pages over HTTP on a fixed port so a real browser tab can run
// the test pages in real time (file:// opens as a static snapshot in the pane).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("./dist/pages/", import.meta.url).pathname;
const TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
};

createServer((request, response) => {
    const path = decodeURIComponent(request.url.split("?")[0]);
    const file = join(root, normalize(path === "/" ? "/plain.html" : path));
    readFile(file).then(
        (body) => {
            response.writeHead(200, {
                "content-type":
                    TYPES[extname(file)] ?? "application/octet-stream",
            });
            response.end(body);
        },
        () => response.writeHead(404).end(),
    );
}).listen(4173, "127.0.0.1", () =>
    console.log("serving", root, "on http://127.0.0.1:4173"),
);
