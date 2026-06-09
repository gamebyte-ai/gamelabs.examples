# Screens Example

A minimal Gamelabs.js example demonstrating screen navigation using the built-in `MainScreen` and `LevelProgressScreen` modules. No custom views or controllers — this shows how to wire modules together with events and transitions.

## What it shows

- Using modules without any custom views or controllers
- Module asset overrides (`overrideRequestUrl` for the logo) before `addModule()`
- Screen navigation via `viewFactory.createScreenView()` with slide transitions
- Event-driven navigation between screens (`MainScreenEvents`, `LevelProgressScreenEvents`)
- Providing a custom model to a module (`LevelProgressModel` implementing `ILevelProgressScreenModel`)
- Using `UnsubscribeBag` for event subscription cleanup

## Project structure

```
screens
├──assets
│   └──example_logo.png
└──src
    ├──models
    │   └──LevelProgressModel.ts
    ├──ScreensApp.ts
    ├──ScreensConfig.ts
    └──main.ts
```

## Screen flow

```
MainScreen ──(play click)──► LevelProgressScreen
                                    │
MainScreen ◄──(back click)──────────┘
```

- `MainScreenEvents.onPlayClick` → navigates to LevelProgressScreen (slide down)
- `LevelProgressScreenEvents.onBackClick` → navigates back to MainScreen (slide up)

## Running

```bash
npm install
npm run dev
```

## Playable-ad (single-page) build

`npm run playable:build` produces one self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests, so the file
can be dropped straight into an ad network. `npm run playable:dev` serves the same entry on
port 5310 for local QA.

The playable reuses `src/main.ts` unchanged; the only differences from the regular build are
the `index.playable.html` entry (which adds a `window.playableSDK` shim for the ad network)
and `vite.playable.config.ts`. The single-file build (`vite-plugin-singlefile`) inlines all
emitted assets, and the high `assetsInlineLimit` plus `inlineDynamicImports` ensure framework
textures and dynamic chunks are inlined automatically.
