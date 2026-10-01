// The same output options scripts/config.js uses for --single-file, so the
// chunk measured here is shaped like the one the real build would inline.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    build: {
        target: "esnext",
        cssCodeSplit: false,
        modulePreload: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        rollupOptions: {
            output: { manualChunks: undefined, inlineDynamicImports: true },
        },
    },
});
