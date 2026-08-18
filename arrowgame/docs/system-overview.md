# Arrow Nudge Escape - System Overview

## File Structure Plan
The file layout is designed to separate the 3D rendering (Three.js), 2D HUD (PixiJS), and core game logic (MVC) cleanly.

```
/workspace/
├── public/
│   ├── assets/
│   │   ├── images/          # AI-generated game assets
│   │   │   ├── gameplay_bg.png
│   │   │   ├── arrow_up.png
│   │   │   ├── arrow_down.png
│   │   │   ├── arrow_left.png
│   │   │   ├── arrow_right.png
│   │   │   ├── logo.png
│   │   │   ├── btn_restart.png
│   │   │   └── btn_next.png
│   │   └── audio/           # Sound effects
│   │       ├── sfx_click.mp3
│   │       ├── sfx_slide.mp3
│   │       ├── sfx_blocked.mp3
│   │       ├── sfx_win.mp3
│   │       └── bgm_gameplay.mp3
│   └── logo.svg             # GameByte logo
├── src/
│   ├── MyGameApp.ts         # GamelabsApp entry point
│   ├── MyGameConfig.ts      # Game configuration (grid size, speeds, colors)
│   ├── MyGameUIIds.ts       # Screen and Popup IDs
│   ├── main.ts              # App bootstrapper
│   ├── controllers/
│   │   └── GameScreenViewController.ts # Coordinates state, 3D view, and 2D HUD
│   ├── views/
│   │   ├── IGameScreenView.ts          # Narrow interface for the view
│   │   ├── GameScreenView.pixi.ts      # PixiJS HUD (Score, Level, Restart, Next buttons)
│   │   └── GameScreenView.three.ts     # Three.js 3D world (Grid, Blocks, Lights, Raycaster)
│   └── utilities/
│       ├── GameState.ts     # Reactive game state (active level, remaining blocks)
│       └── LevelData.ts     # Hand-built level definitions
└── docs/
```

## System Flow Diagram (ASCII)
```
  [Player Input] (Click/Tap)
         │
         ▼
[GameScreenView.three] (Raycasts to find clicked 3D block mesh)
         │
         ▼
[GameScreenViewController] (Receives block click event)
         │
         ▼
[GameState / GameOperations] (Checks if path is clear in arrow direction)
         │
         ├───────────────────────────────┐
         ▼ (If Clear)                    ▼ (If Blocked)
[Animate Slide Out]              [Animate Shake]
[Play Slide SFX]                 [Play Blocked SFX]
[Update GameState (Remove Block)]        │
         │                               │
         ▼                               ▼
[Check Win Condition]            [Wait for Next Input]
         │
         ▼ (If Win)
[Show Level Complete HUD]
[Play Win SFX]
```

## Asset Integration Plan
- **Preloading**: All assets defined in `docs/asset-list.md` and `docs/audio-spec.md` are enqueued in `loadAssets()` of `MyGameApp.ts` and preloaded at boot.
- **3D Textures**: `GameScreenView.three.ts` loads the arrow textures (`arrow_up.png`, etc.) and maps them onto the top face of the 3D cube meshes using `THREE.TextureLoader` or the framework's asset manager.
- **2D UI**: `GameScreenView.pixi.ts` uses the preloaded UI textures (`btn_restart.png`, `btn_next.png`, `logo.png`) to render HUD buttons and overlays.
- **Audio**: `AudioService` is resolved from DI to play sound effects (`sfx_slide.mp3`, `sfx_blocked.mp3`, `sfx_win.mp3`) and loop background music (`bgm_gameplay.mp3`).

## Data Flow
- **State Management**: `GameState.ts` holds the reactive state (current level index, active grid model, remaining blocks count). It exposes a read-only interface `IGameState` to the controller.
- **Events**: View reports inputs (block clicks, button taps) to the controller. Controller updates the state via operations, and triggers view updates (slide block, shake block, update HUD text, show results popup) based on state changes.

## Module Dependencies
- **MyGameApp**: Bootstraps the application, registers views, preloads assets, and sets up DI.
- **GameScreenViewController**: Glues the 3D world (`GameScreenView.three.ts`) and 2D HUD (`GameScreenView.pixi.ts`) together. It contains no rendering-specific code.
- **GameScreenView.three**: Manages Three.js scene, meshes, lighting, camera, and raycasting. It does not contain game logic.
- **GameScreenView.pixi**: Manages PixiJS HUD, buttons, labels, and overlays. It does not contain game logic.
- **GameState**: Pure logic/state container. No Three.js/PixiJS dependencies.
