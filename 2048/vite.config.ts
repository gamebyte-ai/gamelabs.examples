import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    include: ["typed-signals", "pixi.js", "@pixi/layout", "@pixi/ui"],
    exclude: ["@gamebyte/gamelabsjs"]
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"]
  },
  server: {
    port: 5181,
    strictPort: true,
    fs: { allow: [repoRootPath] }
  }
});
