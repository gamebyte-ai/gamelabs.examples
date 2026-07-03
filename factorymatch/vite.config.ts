import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // cannon-es is reached through the framework's physics3d subpath — pre-bundle it.
    // 4.0.0: when gamelabs.js ships from a symlink, Vite's dep scan no longer sees
    // pixi.js as a direct dep, so its transitive CJS packages fail in dev unless the
    // pixi packages are force-included here (see CHANGELOG 4.0.0).
    include: ["typed-signals", "cannon-es", "gsap", "pixi.js", "@pixi/layout", "@pixi/ui"],
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
