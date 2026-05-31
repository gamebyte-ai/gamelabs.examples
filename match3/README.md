# Match-3 Example

A match-3 puzzle game demonstrating the `GameGrid` module with gem matching, gravity, refill cascades, and animated board interactions. Uses Three.js for the 3D gem board and PixiJS for the HUD score display.

## What it shows

- Extending the `GameGrid` module with custom models, views, and controllers
- Custom `GameBoardItem` model with `gemType` property
- Match-3 in-domain logic in a utility (`GameOperations`): match detection, gravity, refill, swap validation
- Initial board generation with no pre-existing matches
- Animated gem interactions using GSAP: swap, invalid swap bounce, match pop (scale up + shrink), gravity drop (bounce), refill spawn
- Gem selection highlighting with wireframe shell, halo ring, and emissive glow
- Event-driven score updates via `GameEvents`
- Using `GameCameraBinding` with `Topdown2dCameraController` and orthographic projection
- HUD controller (`GameScreenViewController`) wired to view interface, not concrete class

## Project structure

```
match3
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
│   ├──Match3App.ts
│   ├──Match3Config.ts
│   ├──Match3GameGridBinding.ts
│   └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameBoardsView` (GridsView) | `GameBoardsViewController` | 3D gem board with selection, swap, match, gravity, and refill animations |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD displaying score and hint text |
| `GameBoardCellObject` | — | Individual board cell with pointer input |
| `GameBoardItemObject` | — | 3D gem sphere with selection highlight and GSAP animations |

> **Naming convention:** every per-board class — model (`GameBoardItem`), view (`GameBoardsView`), controller (`GameBoardsViewController`), view interface (`IGameBoardsView`), cell object, item object, item options, and object creator — is named `GameBoard*` rather than the game-specific `Match3*`. The names describe the *role* in the architecture (a thing that lives on the game's board), not the gameplay (a "gem"). Game-specific code (App, Config, AssetIds, Binding) keeps the `Match3*` prefix; generic in-app pieces (`GameOperations`, `GameEvents`, `GameScreenViewController`) drop the prefix. The in-domain logic class `GameOperations` uses the `*Operations` suffix rather than `*Service` because it's pure in-app logic (no external I/O).

## Events

| Event class | Signals | Flow |
|------------|---------|------|
| `GameEvents` | `onScoreChanged` | `GameBoardsViewController` emits after clearing matches, `GameScreenViewController` updates score display |

## Game flow

```
Player clicks gem A → selects it (highlight)
Player clicks adjacent gem B
    → GameBoardsViewController checks swap validity
        → if creates match:
            animate swap → apply swap → match cascade loop:
                find matches → animate pop → clear cells → emit score
                → apply gravity → animate drops
                → refill empty → animate spawns
                → repeat until no matches
        → if no match:
            animate invalid swap (bounce back)
Player clicks non-adjacent gem B → reselects B
Player clicks same gem → deselects
```

## Running

```bash
npm install
npm run dev
```
