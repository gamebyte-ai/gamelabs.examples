import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    // Otherwise Yoga may be initialized in one copy while `.layout = ...` uses another copy,
    // which crashes with `Cannot read properties of undefined (reading 'Node')`.
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"]
  },
  server: {
    port: 5175,
    strictPort: true,
    fs: { allow: [resolve(__dirname, "../..")] }
  }
});

