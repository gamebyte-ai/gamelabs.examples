# Color Block Jam Example

A color-matching brick puzzle where the player drags multi-cell blocks across a board, snapping them to grid cells and pushing them out through colored doors. Uses Three.js for the board and PixiJS for the HUD + win popup. Block silhouettes are pre-baked GLB shapes.

## What it shows

- Extending `GamelabsApp` for a drag-driven 3D puzzle with a 2D HUD overlay
- `GameCameraBinding` with `Orbital3dCameraController` (orbit-tilted top-down view)
- Pre-baked GLB block shapes (`BrickShapeAssets`) loaded via `AssetManager`
- Pointer-driven block drag with grid snapping; in-domain rules (`GameOperations`) decide legality
- `LevelManager` driving level load + level advance; level schema defined in `LevelSchema.ts`
- Popup-driven win flow using `ViewFactory.registerPopup` and `UIEvents.createPopup`
- Single-screen + single-popup app: `GameScreen` shows the score / HUD, `WinPopup` shows the level-complete state
- Custom `SfxService` for sound effects on cleared blocks
- Event-driven communication via `GameEvents`

## Project structure

```
colorblockjam
├──assets/                          (brick GLBs, door textures, sfx)
└──src
    ├──controllers/
    │   ├──BoardViewController.ts
    │   ├──GameScreenViewController.ts
    │   └──WinPopupViewController.ts
    ├──views/
    │   ├──BoardView.three.ts / IBoardView.ts
    │   ├──GameScreenView.pixi.ts / IGameScreenView.ts
    │   └──WinPopupView.pixi.ts / IWinPopupView.ts
    ├──models/
    │   ├──Block.ts
    │   ├──BlockItem.ts
    │   ├──Door.ts
    │   └──GameModel.ts / IGameModel.ts
    ├──utilities/
    │   ├──GameOperations.ts
    │   └──LevelManager.ts
    ├──services/SfxService.ts
    ├──constants/
    │   ├──BoardTypes.ts
    │   ├──BrickShapeAssets.ts
    │   ├──DragTypes.ts
    │   └──LevelSchema.ts
    ├──events/GameEvents.ts
    ├──ColorBlockJamApp.ts
    ├──ColorBlockJamAssetIds.ts
    ├──ColorBlockJamConfig.ts
    ├──ColorBlockJamUIIds.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `BoardView` (WorldViewBase) | `BoardViewController` | 3D board with the door frame, cells, draggable blocks, and snap preview |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD: level label, retry / next-level buttons, listens for win |
| `WinPopupView` (PopupView) | `WinPopupViewController` | Level-complete popup; emits `onAdvanceLevel` when dismissed |

## Events

| Signal | Emitted by | Listened by |
|--------|------------|-------------|
| `onBlockCleared(blockId, doorId)` | `GameOperations` after a block exits through its matching door | `BoardView` (despawn animation), `SfxService` |
| `onWin` | `GameOperations` when every block has cleared | `GameScreenViewController` (opens `WinPopup`) |
| `onAdvanceLevel` | `WinPopupViewController` | `LevelManager` (loads next level) |
| `onLevelChanged(index)` | `LevelManager` | `GameScreenViewController` (updates label) |

## Game flow

```
LevelManager loads level → builds GameModel from LevelSchema
    → spawns BlockItems on the board, places Doors on each edge

Player drags a block:
    BoardViewController hit-tests pointer → BlockItem
    Drag emits proposed cell origin
    GameOperations.tryMove validates: footprint inside board, no overlap with other blocks
    On release:
        Block's color matches an adjacent door → block exits, emits onBlockCleared
        Otherwise → block snaps to last valid cell

All blocks cleared → onWin → WinPopup opens
Popup dismiss → onAdvanceLevel → LevelManager loads next level → onLevelChanged
```

## Running

```bash
npm install
npm run dev
```
