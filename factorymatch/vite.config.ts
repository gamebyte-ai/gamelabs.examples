import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // cannon-es is reached through the framework's physics3d subpath — pre-bundle it.
    include: ["typed-signals", "cannon-es", "gsap"],
    exclude: ["@gamebyte/gamelabsjs"],
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5189,
    strictPort: true,
    fs: { allow: [repoRootPath] },
  },
});
