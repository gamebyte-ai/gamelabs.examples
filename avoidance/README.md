# Avoidance Example

A survival game where the player (a health cell) must dodge waves of virus enemies crossing the game area. One hit ends the game. Demonstrates the separation of 3D world views and 2D HUD views, the input system with `InputMapper` and `KeyboardListener`, and the `OnScreenControls` module.

## What it shows

- Separating gameplay rendering (`GameAreaView` — Three.js world) from HUD (`GameScreenView` — PixiJS screen)
- Event-driven communication between world controller and HUD controller via `GameEvents`
- `InputMapper` with `KeyboardListener` and `OnScreenControlManager` as dual input devices
- `PlayerInputManager` utility mapping WASD/Arrows + on-screen joystick to a single `"move"` action
- `WaveManager` utility for progressive difficulty (more enemies, faster speed, shorter spawn delays)
- `GameCameraBinding` with `Topdown2dCameraController` and dynamic ortho sizing on resize
- `PopupView` for game-over flow with restart
- `OnScreenControlsBinding` with a static joystick
- Per-frame game loop via `UpdateManager.register()`
- Programmatically generated PNG assets (player, enemy, background)

## Project structure

```
avoidance
├──assets
│   ├──background.png
│   ├──enemy.png
│   └──player.png
└──src
    ├──controllers
    │   ├──GameAreaViewController.ts
    │   ├──GameOverPopupViewController.ts
    │   └──GameScreenViewController.ts
    ├──events
    │   └──GameEvents.ts
    ├──utilities
    │   ├──PlayerInputManager.ts
    │   └──WaveManager.ts
    ├──views
    │   ├──GameAreaView.three.ts
    │   ├──GameOverPopupView.pixi.ts
    │   ├──GameScreenView.pixi.ts
    │   ├──IGameAreaView.ts
    │   ├──IGameOverPopupView.ts
    │   └──IGameScreenView.ts
    ├──AvoidanceApp.ts
    ├──AvoidanceAssetIds.ts
    ├──AvoidanceConfig.ts
    ├──AvoidanceUIIds.ts
    └──main.ts
```

## How to run

```bash
cd examples/avoidance && npm install && npm run dev
```

## Playable-ad (single-page) build

`npm run playable:build` produces a single self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests, ready to upload
to an ad network as-is.

`npm run playable:dev` serves the same single-file entry locally (on port 5302) for QA.

It reuses the regular `src/main.ts` entry — Vite's single-file build automatically inlines
both the example's own `new URL(...)` assets and the framework's default UI textures, so no
extra wiring is needed.
