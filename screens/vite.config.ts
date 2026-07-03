import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    include: ["typed-signals", "pixi.js", "@pixi/layout", "@pixi/ui"],
    // Prevent Vite from caching a stale local build of the framework so rebuilds are picked up immediately.
    exclude: ["@gamebyte/gamelabsjs"]
  },
  resolve: {
    preserveSymlinks: true,
    // CRITICAL: Ensure we only ever bundle ONE copy of Pixi + layout/ui.
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"]
  },
  server: {
    port: 5176,
    strictPort: true,
    fs: { allow: [repoRootPath] }
  }
});

