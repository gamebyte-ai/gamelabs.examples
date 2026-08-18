import { defineConfig } from "vite";

// ────────────────────────────────────────────────────────────────────────
// optimizeDeps.exclude — REQUIRED for @gamebyte/gamelabsjs.
//
// The framework's bundled dist/index.js references its default UI
// textures with `new URL("./assets/<module>/...", import.meta.url)`.
// If Vite pre-bundles the package into node_modules/.vite/deps/,
// `import.meta.url` shifts away from the real dist directory and the
// relative `./assets/...` URLs resolve to non-existent paths — every
// default-skinned UI component renders with Pixi's magenta missing-
// texture marker. Excluding the package keeps import.meta.url anchored
// at node_modules/@gamebyte/gamelabsjs/dist/index.js so assets load.
//
// optimizeDeps.include — force-pre-bundle Pixi + its named CJS
// transitive deps. Under symlink / npm-workspaces resolution (monorepo
// dev, or any consumer using a `file:` link to gamelabs.js), Vite's
// dep scan no longer sees `pixi.js` as a direct consumer dep, so its
// CJS transitives (`eventemitter3`, `parse-svg-path`, …) are served
// un-pre-bundled and fail with `does not provide an export named
// 'default'` in dev. Naming Pixi + its layout/ui companions explicitly
// forces esbuild to bundle them (and everything they pull) into a
// single ESM chunk with proper CJS→ESM interop.
//
// resolve.dedupe — ensures one copy of three.js / Pixi shared between
// the app and the framework. Mixing copies causes Yoga (in @pixi/layout)
// to initialize against one copy while `.layout = ...` uses another,
// crashing with "Cannot read properties of undefined (reading 'Node')".
// ────────────────────────────────────────────────────────────────────────
export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["@gamebyte/gamelabsjs"],
    include: ["typed-signals", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  resolve: {
    dedupe: ["three", "pixi.js", "@pixi/layout", "@pixi/ui"],
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    // The sandbox's vite-proxy forwards external requests to this dev server
    // without rewriting the Host header (no changeOrigin), and previews are
    // served through a per-sandbox Daytona proxy hostname. Vite 7 blocks
    // unknown hosts by default ("Blocked request"), so accept any host — this
    // is always the sandboxed dev server. strictPort keeps Vite on 5173 where
    // the proxy expects it.
    strictPort: true,
    allowedHosts: true,
  },
});
