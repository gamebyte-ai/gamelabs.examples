import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // Do NOT pre-bundle the framework — it references its skin assets via
    // `new URL("./assets/...", import.meta.url)`, which only resolves when served
    // as native ESM from node_modules (pre-bundling breaks those URLs).
    exclude: ["@gamebyte/gamelabsjs"],
    // ...but its runtime deps still need pre-bundling for CJS→ESM interop.
    include: ["pixi.js", "@pixi/ui", "@pixi/layout", "typed-signals", "eventemitter3", "gsap"],
  },
  resolve: {
    preserveSymlinks: true,
    // Ensure a SINGLE copy of three / Pixi / layout / ui across app + framework.
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5193,
    strictPort: true,
    fs: { allow: [repoRootPath] },
  },
});
