# HexaSort Example

A hex-grid sorting puzzle where the player picks stacks of coloured blocks from a tray, drops them on hex cells, and triggers automatic same-colour sorting moves between adjacent cells. Uses Three.js for the hex board and the stack tray, and PixiJS for the HUD.

## What it shows

- Extending `GamelabsApp` with a hex-grid puzzle and a draggable stack tray
- `GameCameraBinding` with `Orbital3dCameraController`
- Hex-coordinate math kept in `constants/HexCoord.ts` and `utilities/HexNeighbors.ts`
- Pure in-domain logic in utilities: `BlockStackOperations` (stack manipulation), `SortOperations` (legal move detection)
- `SortingManager` decoupled from views: it queues animated sort moves and emits events for the view layer to play
- `BlockGridAllocator` model — owns the hex grid's stacks separately from `StacksTray` (tray dispensing model)
- Drag flow that spans two world views (`StacksTrayView` pickup → `HexGridView` drop)
- Custom `SfxService` for sound effects
- Event-driven communication via `GameEvents`

## Project structure

```
hexasort
├──assets/
└──src
    ├──controllers/
    │   ├──GameScreenViewController.ts
    │   ├──HexGridViewController.ts
    │   └──StacksTrayViewController.ts
    ├──views/
    │   ├──HexGridView.three.ts / IHexGridView.ts
    │   ├──StacksTrayView.three.ts / IStacksTrayView.ts
    │   └──GameScreenView.pixi.ts / IGameScreenView.ts
    ├──models/
    │   ├──BlockGridAllocator.ts
    │   ├──BlockItem.ts
    │   ├──BlockStack.ts
    │   ├──StacksTray.ts / IStacksTray.ts
    │   └──IHexGrid.ts
    ├──utilities/
    │   ├──GameOperations.ts
    │   ├──BlockStackOperations.ts
    │   ├──SortOperations.ts
    │   ├──SortingManager.ts
    │   └──HexNeighbors.ts
    ├──services/SfxService.ts
    ├──constants/
    │   ├──HexCoord.ts
    │   ├──HexGridTypes.ts
    │   └──SortMove.ts
    ├──events/GameEvents.ts
    ├──HexaSortApp.ts
    ├──HexaSortConfig.ts
    ├──HexaSortUIIds.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `HexGridView` (WorldViewBase) | `HexGridViewController` | Hex board; renders stacks per cell, plays sort-move animations |
| `StacksTrayView` (WorldViewBase) | `StacksTrayViewController` | Bottom tray with the three pickable stacks; handles pickup pointer flow |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD (score / hint); listens for game events |

## Events

| Signal | Emitted by | Listened by |
|--------|------------|-------------|
| `onStackPickedUp(stack)` | `StacksTrayViewController` on pointer down | `HexGridView` (shows drop preview), tray refills logic |
| `onStackReleased` | tray controller on pointer up over no cell | `HexGridView` (clears preview) |
| `onStackPlaced(stack, col, row)` | `GameOperations` after a legal drop | `HexGridView` (place animation), `SortingManager` (queue sort moves) |
| `onStackDropCancelled(stack)` | `GameOperations` on illegal drop | `StacksTrayView` (bounce back) |
| `onSortMoveStarted(...)` | `SortingManager` per queued move | `HexGridView` (animate stack-to-stack transfer) |
| `onBlockDestroyStarted(col, row)` | `SortingManager` when a completed monocolour stack clears | `HexGridView` (despawn animation) + `SfxService` |

## Game flow

```
StacksTray spawns 3 pickable stacks at the start (and after the last is placed)

Player drags a stack:
    StacksTrayViewController emits onStackPickedUp
    Pointer over hex cell → HexGridView shows drop preview
    Release on empty / compatible cell:
        GameOperations validates placement
        → onStackPlaced, then SortingManager scans adjacency for legal sort moves

SortingManager runs the move queue:
    For each move:
        onSortMoveStarted → HexGridView animates the transferred blocks
        If a cell ends up holding a single-colour stack of the right height
            → onBlockDestroyStarted → cell clears
    Continues until no more moves

Tray empty → spawn next 3 stacks
```

## Running

```bash
npm install
npm run dev
```

## Playable-ad (single-page) build

`npm run playable:build` produces one self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests, so the file
can be dropped straight into an ad network. `npm run playable:dev` serves the same entry on
port 5308 for local QA.

The playable reuses `src/main.ts` unchanged; the only differences from the regular build are
the `index.playable.html` entry (which adds a `window.playableSDK` shim for the ad network)
and `vite.playable.config.ts`. The single-file build (`vite-plugin-singlefile`) inlines all
emitted assets, and the high `assetsInlineLimit` plus `inlineDynamicImports` ensure framework
textures and dynamic chunks are inlined automatically.
