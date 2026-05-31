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
