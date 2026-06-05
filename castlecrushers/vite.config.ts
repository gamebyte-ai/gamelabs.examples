import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // matter-js is CJS and reached through the framework's physics2d subpath —
    // pre-bundle it so the ESM `import * as Matter` interop works in dev.
    include: ["typed-signals", "matter-js"],
    exclude: ["@gamebyte/gamelabsjs"],
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5188,
    strictPort: true,
    fs: { allow: [repoRootPath] },
  },
});
