import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    port: 5182,
    strictPort: true,
    fs: { allow: [resolve(__dirname, "../..")] }
  }
});
