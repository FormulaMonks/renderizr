#! /usr/bin/env node

import { build } from "vite";
import { resolve } from "node:path";

await build({
    root: resolve(import.meta.dirname, ".."),
});

console.log("Complete!");
