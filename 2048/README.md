# 2048 Example

A classic 2048 sliding-tile puzzle built on the `gamegrid` module. Uses Three.js for the
4x4 board and PixiJS for the HUD score / best / restart UI.

## What it shows

- Extending the `GameGrid` module with a custom `GameBoardItem` model and a 4x4 grid
- Two-phase grid mutation in `GameOperations`: `planMove` computes a slide / merge
  plan from the current model state, `commitPlan` applies it once the slide animation
  completes
- 2048 rules: directional compaction, single-merge-per-tile per move, 90/10 spawn for
  new 2 / 4 tiles, game-over detection
- Animated tile interactions using GSAP: slide, merge pop, spawn pop
- Procedural canvas-textured tile faces (no per-value image assets)
- Keyboard input via `KeyboardListener` (arrow keys + WASD) and pointer swipe input
- Event-driven score / best / game-over updates via `GameEvents`
- Best score persistence via `StorageService`
- `gamecamera` with `Topdown2dCameraController` and orthographic projection
- `settings` module wired to the `AudioService` for SFX volume / mute (no music)
- Sound effects only — no background music

## Project structure

```
2048
├──assets
│   ├──sfx_invalid.wav
│   ├──sfx_merge.wav
│   ├──sfx_move.wav
│   └──sfx_spawn.wav
├──src
│   ├──controllers
│   │   ├──GameBoardsViewController.ts
│   │   └──GameScreenViewController.ts
│   ├──events
│   │   └──GameEvents.ts
│   ├──models
│   │   └──GameBoardItem.ts
│   ├──utilities
│   │   └──GameOperations.ts
│   ├──views
│   │   ├──IGameScreenView.ts
│   │   ├──GameScreenView.pixi.ts
│   │   ├──IGameBoardsView.ts
│   │   ├──GameBoardCellObject.ts
│   │   ├──GameBoardItemObject.ts
│   │   ├──GameBoardItemObjectOptions.ts
│   │   ├──GameBoardObjectCreator.ts
│   │   └──GameBoardsView.three.ts
│   ├──Game2048App.ts
│   ├──Game2048AssetIds.ts
│   ├──Game2048Config.ts
│   ├──Game2048GameGridBinding.ts
│   ├──Game2048UIIds.ts
│   └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameBoardsView` (`GridsView`) | `GameBoardsViewController` | 4x4 board, slide / merge / spawn animations, keyboard + swipe input |
| `GameScreenView` (`ScreenView`) | `GameScreenViewController` | HUD with score, best, restart button, settings button, game-over overlay |
| `GameBoardCellObject` | — | Static board cell (non-interactive) |
| `GameBoardItemObject` | — | Tile rendered as a canvas-textured plane keyed by value |

> **Naming convention:** every per-board class — model (`GameBoardItem`), view (`GameBoardsView`), controller (`GameBoardsViewController`), view interface (`IGameBoardsView`), cell object, item object, item options, and object creator — is named `GameBoard*` rather than the game-specific `Game2048*`. The names describe the *role* in the architecture (a thing that lives on the game's board), not the gameplay (a "tile"). Game-specific code (App, Config, AssetIds, Events, Operations, Binding) keeps the `Game2048*` prefix. The in-domain logic class `GameOperations` uses the `*Operations` suffix rather than `*Service` because it's pure in-app logic (no external I/O).

## Events

| Event | Signals | Flow |
|-------|---------|------|
| `GameEvents.onScoreChanged` | Score updated | Controller emits after a successful move; HUD updates score text |
| `GameEvents.onBestChanged` | Best score updated | Controller emits after a successful move; HUD persists via `StorageService` |
| `GameEvents.onGameOver` | No moves left | Controller emits; HUD shows the game-over overlay |
| `GameEvents.onRestartTapped` | User pressed restart | HUD emits; controller resets the board |
| `GameEvents.onPlaySfx` | Play a sound | Controller emits; HUD forwards to `AudioService` |

## Game flow

```
Player presses arrow / WASD key OR swipes a direction
    → GameBoardsViewController computes a MovePlan via GameOperations.planMove
        → if plan.moved is false:
            play "invalid" sfx, ignore
        → otherwise:
            play "merge"/"move" sfx
            animate slide tweens for every moving tile
            commit plan to the model (destroys absorbed tiles, replaces merge survivors)
            emit score / best
            animate merge pops (if any merges happened)
            spawn one new random tile (2 or 4) — animate spawn pop, play "spawn" sfx
            check game-over: if no moves remain, emit onGameOver
Player taps restart button → HUD emits restart → controller resets service + board
```

## Running

```bash
npm install
npm run dev
```
