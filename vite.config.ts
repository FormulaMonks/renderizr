import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const stringIsAValidUrl = (s: string, protocols: string[]) => {
    try {
        const url = new URL(s);
        return protocols
            ? url.protocol
                ? protocols
                      .map((x: string) => `${x.toLowerCase()}:`)
                      .includes(url.protocol)
                : false
            : true;
    } catch (err) {
        return false;
    }
};

export default async () => {
    const workspace = process.argv[process.argv.length - 1];
    const workspaceData = stringIsAValidUrl(workspace, ["http", "https"])
        ? // If valid URL, fetch the workspace from the URL
          await fetch(workspace)
              .then((res) => res.json())
              .then((res) => JSON.stringify(res))
        : // Otherwise, read the contents of the resolved file
          await readFile(resolve(process.cwd(), workspace), "utf-8");

    return defineConfig({
        build: {
            target: "esnext",
            outDir: "./dist",
            cssCodeSplit: false,
        },
        define: {
            workspaceData,
        },
    });
};
