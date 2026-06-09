# HelloWorld Example

A minimal Gamelabs.js example demonstrating a 3D cube with an orbital camera and HUD controls. Uses Three.js for the world layer and PixiJS for the HUD.

## What it shows

- Extending `GamelabsApp` with the standard lifecycle (`registerModules`, `configureDI`, `configureViews`, `loadAssets`, `postInitialize`)
- Loading a GLTF model via `AssetManager`
- World view (`CubeView`) with pointer input handling and drag events
- HUD screen (`GameScreenView`) composing child views (`TopBarView`, `DebugBarView`)
- View/Controller separation: views report user input, controllers own behavior
- Event-driven communication between controllers (`GameEvents`, `DebugEvents`)
- Using the `GameCameraBinding` module with `Orbital3dCameraController`
- DevUtils integration (logger, stats panel, ground grid toggles)

## Project structure

```
helloworld
├──assets
│   └──cube.glb
└──src
    ├──controllers
    │   ├──CubeViewController.ts
    │   ├──DebugBarViewController.ts
    │   ├──GameScreenViewController.ts
    │   └──TopBarViewController.ts
    ├──views
    │   ├──ICubeView.ts
    │   ├──IDebugBarView.ts
    │   ├──IGameScreenView.ts
    │   ├──ITopBarView.ts
    │   ├──CubeView.three.ts
    │   ├──DebugBarView.pixi.ts
    │   ├──GameScreenView.pixi.ts
    │   └──TopBarView.pixi.ts
    ├──events
    │   ├──GameEvents.ts
    │   └──DebugEvents.ts
    ├──HelloWorldApp.ts
    ├──HelloWorldAssetIds.ts
    ├──HelloWorldConfig.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `CubeView` (WorldViewBase) | `CubeViewController` | 3D GLTF cube with rotation animation, color changes, and orbital camera drag |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | Full-screen HUD composing TopBar and DebugBar |
| `TopBarView` (HudViewBase) | `TopBarViewController` | Buttons for toggling cube color, rotation, and debug panel |
| `DebugBarView` (HudViewBase) | `DebugBarViewController` | Buttons for toggling ground grid, stats panel, and logger |

## Events

| Event class | Signals | Used by |
|------------|---------|---------|
| `GameEvents` | `onChangeCubeColor`, `onToggleCubeRotation` | TopBarViewController emits, CubeViewController listens |
| `DebugEvents` | `onToggleDebugPanel` | TopBarViewController emits, DebugBarViewController listens |

## Running

```bash
npm install
npm run dev
```

## Playable-ad (single-page) build

`npm run playable:build` produces one self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests, so the file
can be dropped straight into an ad network. `npm run playable:dev` serves the same entry on
port 5307 for local QA.

The playable reuses `src/main.ts` unchanged; the only differences from the regular build are
the `index.playable.html` entry (which adds a `window.playableSDK` shim for the ad network)
and `vite.playable.config.ts`. The single-file build (`vite-plugin-singlefile`) inlines all
emitted assets, and the high `assetsInlineLimit` plus `inlineDynamicImports` ensure framework
textures and dynamic chunks are inlined automatically.
