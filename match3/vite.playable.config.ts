import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const repoRootPath = decodeURIComponent(new URL("../..", import.meta.url).pathname);

// Playable-ad build: one self-contained index.playable.html with all JS, CSS,
// and assets inlined as data: URIs (no external requests). Mirrors the regular
// vite.config resolution and adds single-file inlining.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  optimizeDeps: {
    include: ["typed-signals"],
    exclude: ["@gamebyte/gamelabsjs"],
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5309,
    strictPort: true,
    fs: { allow: [repoRootPath] },
  },
  build: {
    target: "es2020",
    outDir: "dist-playable",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline every asset Vite sees
    rollupOptions: {
      input: "index.playable.html",
      output: { inlineDynamicImports: true },
    },
  },
});
