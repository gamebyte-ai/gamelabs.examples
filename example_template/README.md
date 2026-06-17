# example_template

The minimum starting point for a new Gamelabs.js game: one `GameScreen` with a title and an empty world.

## What it shows

- `TemplateApp` — extends `GamelabsApp`, registers one screen, creates it in `postInitialize`.
- `GameScreenView` / `GameScreenViewController` — full-screen Pixi screen that renders the configured title.
- `TemplateConfig` — a single place for app-level values (title, screen transition).
- `TemplateUIIds` — namespaced enum of UI IDs.

The Three.js world layer is created by the framework but left empty — add cameras, views, and modules as your game needs them.

## Project structure

```
example_template
└──src
    ├──controllers
    │   └──GameScreenViewController.ts
    ├──views
    │   ├──IGameScreenView.ts
    │   └──GameScreenView.pixi.ts
    ├──TemplateApp.ts
    ├──TemplateConfig.ts
    ├──TemplateUIIds.ts
    └──main.ts
```

## Running

```bash
npm install
npm run dev
```

## Extending

- Add an asset enum (`TemplateAssetIds.ts`) when you load assets, then enqueue them in `loadAssets()`.
- Add a world view (extending `WorldViewBase`) and create it in `postInitialize()` via `this.viewFactory.createView(...)` + `this.world.addView(...)`.
- Add modules (e.g. `GameCameraBinding`) in `registerModules()`.

## Common pitfalls

These are the three silent failures we've seen scaffolded games hit. The framework now ships defenses for each, but knowing the rules keeps custom code from re-introducing them.

### 1. Canvas layer CSS

The framework attaches two `<canvas>` elements inside the mount: `canvas.layer.world3d` (Three.js) and `canvas.layer.hud2d` (PixiJS). They must stack. This template defines the canonical CSS in `src/style.css`:

```css
#stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
canvas.layer { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
canvas.layer.world3d { z-index: 0; }
canvas.layer.hud2d   { z-index: 1; }
```

If you mount somewhere other than `#stage` or omit this CSS, `GamelabsApp` injects low-specificity (`:where()`) defaults so the canvases still overlap. Don't rely on the fallback for new templates — write the CSS explicitly.

### 2. `.layout` on screen views

`@pixi/layout` only sizes children that have their own `.layout` and live under a parent with `.layout`. A `ScreenView` subclass that uses layout-based children but doesn't set its own `.layout` collapses to zero size and renders nothing — no error.

`ScreenView.onResize()` now applies a sensible default `{ width: w, height: h }` when none is set, but for custom layout (centering, padding, flex direction) set it explicitly after calling `super.onResize(...)`:

```ts
public override onResize(width: number, height: number, dpr: number): void {
  super.onResize(width, height, dpr);
  this.layout = { width, height, justifyContent: "center", alignItems: "center" };
}
```

### 3. `postInitialize` / `onResize` timing

`HudViewBase`/`WorldViewBase` fire the initial `onResize` once your subclass's `postInitialize` has returned (deferred via `queueMicrotask`). Old defensive checks like `if (!this.foo) return;` inside `onResize` are no longer needed — children built in `postInitialize` exist by the time resize fires.

If you build graphics on a delayed condition (async asset, conditional branch), guard those accesses; the framework only guarantees the synchronous `postInitialize` body has run.
