# Gamebyte template

Starter project for building a game with [@gamebyte/gamelabsjs](https://github.com/gamebyte-ai/gamelabs.js). Copy this folder, rename the package, and start replacing `MyGame*` with your game's name.

## Layout

```
.
├── index.html                  ← dev/prod entry
├── vite.config.ts              ← Vite config
├── assets/                     ← drop game assets here (create on demand)
└── src/
    ├── main.ts                 ← entry point
    ├── MyGameApp.ts
    ├── MyGameConfig.ts
    ├── MyGameUIIds.ts
    ├── controllers/
    └── views/
```

## Development

```bash
npm install
npm run dev          # vite dev server on http://localhost:5173
npm run build        # production build → dist/
npm run preview      # preview the production build
```

## Adding assets

Load assets in your app's `loadAssets()`. Reference each file with a **static** `new URL("../assets/<file>", import.meta.url)` literal and pass it to `AssetManager.load(...)`:

```ts
// src/MyGameApp.ts
import { AssetTypes } from "@gamebyte/gamelabsjs";

protected override loadAssets(): void {
  this.assetManager.load(
    AssetTypes.HudTexture,
    MyGameAssetIds.Logo,
    new URL("../assets/logo.png", import.meta.url).href,
  );
}
```

> **One constraint:** the path must be a static string literal inside `new URL(..., import.meta.url)`. Vite resolves these by statically analyzing that exact form — a runtime-built path (e.g. `new URL(`../assets/${name}.png`, import.meta.url)`) can't be seen. Enumerate variants as explicit literals instead.

## Common pitfalls

These are the three silent failures we've seen scaffolded games hit. The framework now ships defenses for each, but you should know the rules so custom code doesn't re-introduce them.

### 1. Canvas layer CSS

The framework attaches two `<canvas>` elements inside the mount: `canvas.layer.world3d` (Three.js) and `canvas.layer.hud2d` (PixiJS). They must stack on top of each other. This template's `index.html` already includes the canonical CSS:

```css
#stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
#stage .layer { position: absolute; inset: 0; display: block; }
#stage .layer.world3d { z-index: 1; }
#stage .layer.hud2d   { z-index: 2; }
```

If you mount somewhere other than `#stage` or remove this CSS, `GamelabsApp` injects low-specificity (`:where()`) defaults so the canvases still overlap. Don't rely on the fallback for new templates — write the CSS explicitly.

### 2. `.layout` on screen views

`@pixi/layout` only sizes children that have their own `.layout` and live under a parent with `.layout`. A `ScreenView` subclass that uses layout-based children but doesn't set its own `.layout` collapses to zero size and renders nothing — no error.

`ScreenView.onResize()` now applies a sensible default `{ width: w, height: h }` when none is set, but for any custom layout (centering, padding, flex direction) set it explicitly after calling `super.onResize(...)`:

```ts
public override onResize(width: number, height: number, dpr: number): void {
  super.onResize(width, height, dpr);
  this.layout = { width, height, justifyContent: "center", alignItems: "center" };
}
```

### 3. `postInitialize` / `onResize` timing

`HudViewBase`/`WorldViewBase` fire the initial `onResize` once your subclass's `postInitialize` has returned (deferred via `queueMicrotask`). Old defensive checks like `if (!this.foo) return;` inside `onResize` are no longer needed — children built in `postInitialize` exist by the time resize fires.

If you build graphics on a delayed condition (async asset, conditional branch), guard those accesses; the framework only guarantees the synchronous `postInitialize` body has run.
