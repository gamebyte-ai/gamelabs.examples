# Tower Defense Example

A tower-defense game where the player places towers on a generated grid, enemies follow a baked path from spawn to base, and per-frame `EnemyManager` / `CombatManager` systems drive movement and damage. Uses Three.js for the 3D scene and PixiJS for the HUD + generating-level popup.

## What it shows

- Extending `GamelabsApp` with a custom `GameGrid` module specialization (`TowerDefenseGameGridBinding`) plus app-side pure-state managers
- `GameCameraBinding` with `Orbital3dCameraController`
- Per-frame systems registered with `UpdateManager`: enemy movement, combat, passive gold income, scene reconcile
- Reconcile-based rendering: managers mutate pure state in `GameState`; `_reconcileScene` walks the state and updates THREE objects (creates / disposes / moves) rather than the managers touching the scene directly
- `LevelManager` orchestrates level generation; `GeneratingPopup` shows while the path is being baked
- Custom gamegrid module: `TowerDefenseGameGridBinding` registers cell + item objects (`GameBoardCellObject`, `GameBoardItemObject`, `GameBoardObjectCreator`, `TerrainTextureFactory`)
- Billboarded health bars (`BillboardHealthBar`) parented to enemy meshes
- Event-driven UI flow via `GameEvents`: cell selection, tower placement modes, gold updates, base damage
- Custom `SfxService` (cannon fire, enemy hit, base damage)

## Project structure

```
towerdefense
├──assets/
└──src
    ├──controllers/
    │   ├──GameSceneViewController.ts
    │   ├──GameScreenViewController.ts
    │   └──GeneratingPopupViewController.ts
    ├──views/
    │   ├──GameSceneView.three.ts / IGameSceneView.ts
    │   ├──GameScreenView.pixi.ts / IGameScreenView.ts
    │   ├──GeneratingPopupView.pixi.ts / IGeneratingPopupView.ts
    │   └──BillboardHealthBar.ts
    ├──models/
    │   └──GameState.ts / IGameState.ts
    ├──modules/gamegrid/
    │   ├──TowerDefenseGameGridBinding.ts
    │   ├──controllers/GameBoardsViewController.ts
    │   ├──models/GameBoardItem.ts
    │   └──views/                       (cell + item objects, object creator, terrain factory)
    ├──utilities/
    │   ├──GameOperations.ts
    │   ├──LevelManager.ts
    │   ├──EnemyManager.ts
    │   ├──CombatManager.ts
    │   └──ILevelState.ts
    ├──services/SfxService.ts
    ├──constants/
    │   ├──CellType.ts
    │   ├──EnemyTypeDef.ts
    │   ├──EntityStates.ts
    │   ├──PathCellInfo.ts
    │   └──TowerTypeDef.ts
    ├──events/GameEvents.ts
    ├──TowerDefenseApp.ts
    ├──TowerDefenseConfig.ts
    ├──TowerDefenseUIIds.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameSceneView` (WorldViewBase) | `GameSceneViewController` | Owns the 3D scene root; per-frame reconcile updates enemy meshes, projectiles, and tower visuals from `GameState` |
| `GameBoardsView` (custom GameGrid) | `GameBoardsViewController` (in `modules/gamegrid/`) | Renders the cell grid, terrain texture, path highlight, and per-cell items |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD: gold, base HP, tower-buy buttons, listens for events |
| `GeneratingPopupView` (PopupView) | `GeneratingPopupViewController` | "Generating level…" popup shown while path baking runs |

## Events

| Signal | Emitted by | Listened by |
|--------|------------|-------------|
| `onLevelGenerated` | `LevelManager` after path bake | `GameScreenViewController` (closes popup), `GameSceneViewController` (starts ticking) |
| `onTeardownLevel` | `LevelManager` before regen | scene + screen controllers |
| `onCellSelected(col, row)` | `GameBoardsViewController` on tap | placement flow / build-menu |
| `onStartPlacement(towerType)` | HUD buy button | controllers (enter placement mode) |
| `onCancelPlacement` | HUD cancel / re-press | exit placement mode |
| `onTowerPlaced(col, row, type)` | `GameOperations` on legal placement | scene reconcile (adds tower mesh) |
| `onCannonFired(towerCol, towerRow, x, z)` | `CombatManager` | scene (projectile + muzzle FX), `SfxService` |
| `onEnemyKilled(reward, x, z)` | `CombatManager` | `GameOperations` (gold reward), scene (death FX) |
| `onEnemyReachedBase(damage)` | `EnemyManager` | `GameOperations` (decrement base HP) |
| `onGoldChanged(total)` | `GameOperations` | HUD gold label |

## Game flow

```
LevelManager.generate(): bake spawn → base path, populate GameState cells
    onLevelGenerated → GeneratingPopup closes, level ticks begin

Per frame (UpdateManager registered systems, in order):
    EnemyManager.update: advance each enemy along its path, mark reached-base
    CombatManager.update: scan towers for targets in range, emit cannon-fired, apply damage, kill enemies
    GameOperations.tickPassiveIncome: accumulate per-second gold
    _reconcileScene: walk GameState → create/move/dispose THREE objects

Player taps cell:
    Empty path-adjacent cell + tower selected → GameOperations.placeTower → onTowerPlaced
    Cell with tower → show upgrade / sell menu (HUD)

Enemy reaches base → onEnemyReachedBase → base HP drops → game over when 0
```

## Running

```bash
npm install
npm run dev
```
