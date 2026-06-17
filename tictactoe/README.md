# TicTacToe Example

A two-player TicTacToe game demonstrating the `GameGrid` module with custom game logic, win detection, and a restart flow. Uses Three.js for the 3D board and PixiJS for the HUD.

## What it shows

- Extending the `GameGrid` module with custom models, views, and controllers
- Custom `GameItem` model with team (X/O) property
- Custom grid allocator (`GameGridAllocator`) for creating team-specific items
- Custom cell and item objects (`GameCellObject`, `GameItemObject`) with pointer handling and GSAP spawn animation
- Win/draw detection and game restart via a utility (`TicTacToeTurnManager`)
- Event-driven architecture: `TurnEvents` for turn changes, wins, draws, and restarts
- Win popup with GSAP easing animations (scale + fade) and Play Again button
- Using `GameCameraBinding` with `Topdown3dCameraController`
- Scene setup (fog) handled in the world view, not the app class

## Project structure

```
tictactoe
├──assets
│   ├──cell.png
│   ├──item_o.png
│   └──item_x.png
└──src
    ├──controllers
    │   ├──GameGridsViewController.ts
    │   └──GameScreenViewController.ts
    ├──events
    │   └──TurnEvents.ts
    ├──models
    │   └──GameItem.ts
    ├──utilities
    │   ├──GameGridAllocator.ts
    │   ├──GridOperations.ts
    │   └──TicTacToeTurnManager.ts
    ├──views
    │   ├──IGameScreenView.ts
    │   ├──GameCellObject.ts
    │   ├──GameGridObjectCreator.ts
    │   ├──GameGridsView.three.ts
    │   ├──GameItemObject.ts
    │   ├──GameItemObjectOptions.ts
    │   └──GameScreenView.pixi.ts
    ├──TicTacToeApp.ts
    ├──TicTacToeAssetIds.ts
    ├──TicTacToeConfig.ts
    ├──TicTacToeGameGridBinding.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameGridsView` (GridsView) | `GameGridsViewController` | 3D board with cell pointer handling and scene fog |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD showing active player, win/draw popup with Play Again |
| `GameCellObject` | — | Individual cell with pointer input and texture |
| `GameItemObject` | — | X/O mark with GSAP spawn animation |

## Events

| Event class | Signals | Flow |
|------------|---------|------|
| `TurnEvents` | `onTurnChanged` | TicTacToeTurnManager emits → GameScreenViewController updates active player display |
| `TurnEvents` | `onGameWon` | TicTacToeTurnManager emits → GameScreenViewController shows win popup |
| `TurnEvents` | `onGameDraw` | TicTacToeTurnManager emits → GameScreenViewController shows draw popup |
| `TurnEvents` | `onGameRestarted` | TicTacToeTurnManager emits → GameScreenViewController hides popup |

## Game flow

```
Player X places mark
    → TicTacToeTurnManager.placeMark()
        → win check → if winner → emitGameWon(team) → show popup
        → draw check → if full → emitGameDraw() → show popup
        → else → switch turn → emitTurnChanged(nextTeam)

Play Again button
    → GameScreenViewController → TicTacToeTurnManager.restart()
        → clear board → emitGameRestarted() → emitTurnChanged(X)
```

## Running

```bash
npm install
npm run dev
```
