import { defineConfig } from "vite";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export default defineConfig({
  base: "./",
  optimizeDeps: {
    // Do NOT pre-bundle the framework. It references its skin assets via
    // `new URL("./assets/...", import.meta.url)`, which only resolves when the
    // package is served as native ESM from node_modules. Pre-bundling moves the
    // code into .vite/deps/ and breaks those URLs → missing textures (Pixi's
    // pink "undefined" fallback) for buttons, dropdowns, etc.
    exclude: ["@gamebyte/gamelabsjs"],
    // ...but the framework's runtime deps still need pre-bundling so Vite applies
    // CJS→ESM interop. `typed-signals` (used by `@pixi/ui`) is CommonJS-only; left
    // un-optimized its named `Signal` export fails to resolve. Force these in.
    include: ["pixi.js", "@pixi/ui", "@pixi/layout", "typed-signals", "eventemitter3", "gsap"],
  },
  resolve: {
    preserveSymlinks: true,
    // CRITICAL: ensure only ONE copy of Pixi + layout/ui + three is bundled.
    // Otherwise Yoga may be initialized in one copy while `.layout = ...` uses
    // another, crashing with `Cannot read properties of undefined (reading 'Node')`.
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5192,
    strictPort: true,
    fs: { allow: [repoRootPath] },
  },
});
