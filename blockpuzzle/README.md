# Block Puzzle Example

A grid block-placement puzzle. The player drags pieces from a 3-slot tray onto an 8×8 grid; filling any complete row or column clears it and scores points. The hand refills when empty, and the game ends when no remaining tray piece can fit anywhere. Boosters (Hammer, Tray Refresh, Unit Block) and combo/timer scoring round out the loop. Demonstrates a Three.js world (top-down 2D camera) with a PixiJS HUD, driven by the `gamegrid`, `particles`, and `gamecamera` modules.

## What it shows

- Three.js world rendered through a top-down 2D ortho camera (`Topdown2dCameraController`), with a PixiJS HUD overlaid for score, timer, and boosters
- Two `RectGrid` surfaces (the 8×8 playing grid and a 1×3 tray) flowing through `GridsModel` → `GameBoardsViewController` → `GameBoardsView`
- Custom `gamegrid` module extension (`BlockPuzzleGameGridBinding`) with per-surface cell palettes, shape-driven piece meshes (`PieceMeshBuilder`), and a drag-drop placement pipeline
- Drag ghosting + placement validation: the candidate footprint is previewed on the grid and validated against a controller-installed predicate before drop
- Line-clear rules decoupled behind `IClearRule` / `LineClearRule`, and piece spawning behind `ISpawnSource` / `PieceSpawnOperations`
- Score, combo, timer, and game-state models (`ScoreModel`, `ComboModel`, `TimerModel`, `GameStateModel`) separated from the views
- Boosters via `BoosterPanelModel` + `BoosterPanelState`: Hammer (remove a cell), Tray Refresh (reroll the hand), Unit Block (drag a single cell)
- `particles` module FX: `HammerParticleEmitter` and `UnitBlockSparkleEmitter`
- Vertical-gradient scene background rasterised to a `CanvasTexture`, with a darkened variant while a target-selection booster is pending
- Programmatically driven piece visuals with SVG booster icons (`hammer.svg`, `recycle.svg`, `unit-block.svg`)

## Gameplay

- Drag a piece from one of the 3 tray slots onto the grid; it snaps only where the whole footprint fits empty cells
- Completing any full row or column clears those cells and awards points
- Clearing multiple lines in quick succession builds a combo multiplier
- The tray refills with new pieces once all 3 slots are emptied
- Boosters: Hammer removes a single chosen cell, Tray Refresh rerolls the current hand, Unit Block drops a single-cell piece anywhere
- Game over when none of the remaining tray pieces can be placed on the grid

## Project structure

```
blockpuzzle
├──assets
│   ├──hammer.svg
│   ├──recycle.svg
│   └──unit-block.svg
└──src
    ├──constants
    │   ├──BoardKind.ts
    │   ├──BoosterPanelState.ts
    │   ├──BoosterType.ts
    │   └──GameState.ts
    ├──controllers
    │   └──GameScreenViewController.ts
    ├──events
    │   └──TrayEvents.ts
    ├──models
    │   ├──BoosterPanelModel.ts
    │   ├──ComboModel.ts
    │   ├──GameStateModel.ts
    │   ├──ScoreModel.ts
    │   ├──TimerModel.ts
    │   └──TrayPlaceabilityModel.ts
    ├──modules
    │   └──gamegrid
    │       ├──controllers
    │       │   └──GameBoardsViewController.ts
    │       ├──models
    │       │   └──GameBoardItem.ts
    │       ├──views
    │       │   ├──GameBoardCellObject.ts
    │       │   ├──GameBoardItemObject.ts
    │       │   ├──GameBoardItemObjectOptions.ts
    │       │   ├──GameBoardObjectCreator.ts
    │       │   ├──GameBoardsView.three.ts
    │       │   ├──HammerParticleEmitter.ts
    │       │   ├──IGameBoardsView.ts
    │       │   ├──PieceMeshBuilder.ts
    │       │   └──UnitBlockSparkleEmitter.ts
    │       └──BlockPuzzleGameGridBinding.ts
    ├──utilities
    │   ├──BoardLayoutCalculator.ts
    │   ├──IClearRule.ts
    │   ├──ISpawnSource.ts
    │   ├──ItemIdGenerator.ts
    │   ├──LineClearRule.ts
    │   ├──PiecePlacementOperations.ts
    │   ├──PieceRotationCalculator.ts
    │   ├──PieceSpawnOperations.ts
    │   └──TimeFormatter.ts
    ├──views
    │   ├──GameScreenView.pixi.ts
    │   └──IGameScreenView.ts
    ├──BlockPuzzleApp.ts
    ├──BlockPuzzleAssetIds.ts
    ├──BlockPuzzleConfig.ts
    ├──BlockPuzzleUIIds.ts
    └──main.ts
```

## How to run

```bash
cd examples/blockpuzzle && npm install && npm run dev
```

## Playable-ad (single-page) build

```bash
npm run playable:build   # one self-contained dist-playable/index.playable.html
npm run playable:dev     # serve it locally on http://localhost:5316
```

`npm run playable:build` produces a single self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests are made when the
file is opened. `npm run playable:dev` serves the same entry point on port 5316 for QA.

Both commands reuse `src/main.ts` (the same game code as the normal build) via
`vite.playable.config.ts`. The single-file build inlines game assets and framework textures
automatically, so the resulting HTML can be dropped straight into an ad network as a playable.
