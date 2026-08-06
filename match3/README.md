# Match-3 Example

A match-3 puzzle game demonstrating the `GameGrid` module with gem matching, gravity, refill cascades, and animated board interactions. Uses Three.js for the 3D gem board and PixiJS for the HUD score display.

## What it shows

- Extending the `GameGrid` module with custom models, views, and controllers
- Custom `GameBoardItem` model with `gemType` property
- Match-3 in-domain logic in a utility (`GameOperations`): match detection, gravity, refill, swap validation
- Initial board generation with no pre-existing matches
- Animated gem interactions using GSAP: swap, invalid swap bounce, match pop (scale up + shrink), gravity drop (bounce), refill spawn
- Gem selection highlighting with a halo ring and a uniform scale-up
- Event-driven score updates via `GameEvents`
- Using `GameCameraBinding` with `Topdown2dCameraController` and orthographic projection
- HUD controller (`GameScreenViewController`) wired to view interface, not concrete class
- **Responsive framing:** a `viewport` letterbox band plus an aspect-driven camera zoom band (see below)
- **Safe-area aware HUD:** edge-hugging widgets shift inward by `safeAreaInsets`
- **Host signalling:** `informHost({ type: "ready" })` for playable-ad / portal hosts

## Rendering: a 2D game on a 3D pipeline

Worth knowing before you copy this as a starting point. The renderer is Three.js
(WebGL) but nothing in the scene is actually three-dimensional:

- Gems are `PlaneGeometry` quads with SVG textures, laid flat (`rotation.x = -π/2`)
- The selection halo is a flat `RingGeometry`; the board outline a flat `ShapeGeometry`
- Every material is `MeshBasicMaterial` — **the scene has no lights at all**, so a
  lit material (`MeshStandardMaterial`) would render black
- The camera is orthographic and straight top-down, so there is no perspective
- The small `y` offsets (outline `0.02`, gems `0.06`, halo `0.07`) are draw-order
  layering, not depth

The 3D pipeline is what buys you the `GameGrid` module — `GridCellObject`,
`GridItemObject`, and `GridsView` all extend Three.js `Group`, and none of them
exist in the THREE-free `@gamebyte/gamelabsjs/core` entry. A genuinely 2D
match-3 would have to hand-roll the grid in Pixi (see the `mergegame` and
`castlecrushers` examples for that shape).

## Responsive framing

Two independent layers, both tunable in `Match3Config`:

**1. `viewport` — letterbox / pillarbox.** The framework holds *both* canvases
(Three world + Pixi HUD) inside an aspect band and centers them in the mount;
outside the band the surrounding mount area shows as inert bars.

```ts
viewport = { fit: "contain", minAspect: 9 / 23, maxAspect: 2.2, background: "#000000" }
```

Inside the band the canvases fill the mount (no bars). Narrower than `minAspect`
⇒ top/bottom bars; wider than `maxAspect` ⇒ left/right bars. The band above spans
the tallest portrait phones through a phone rotated to landscape.

Read once in the `Match3App` **constructor**, so the config is built before
`super()` — an instance field initializer would run too late. For the same reason
`viewport` canNOT be changed from `game-config.json`, whose overrides land at
`initialize()` time.

**2. `camera` — aspect-driven zoom band.** The letterbox alone doesn't resize the
board, so the ortho frustum *height* lerps across its own band and pins outside
it: a narrow screen zooms out (board shrinks, staying inside the side edges) and
the board scales up as the screen widens.

```ts
camera = { minAspect: 9 / 23, maxAspect: 3 / 4, orthoAtMin: 19.4, orthoAtMax: 11 }
```

`ortho*` is the frustum height in world units — the visible vertical extent. The
visible width is always `height × aspect`, so a *bigger* value zooms *out*. The
board is ~7.6 wide with its outline, and the defaults keep it near 92% of the
screen width at both ends of the band.

Because the lerp is linear while true edge-fitting is `1 / aspect`, the board sits
a few percent further from the side edges in the middle of a wide band. Narrow the
band, or replace the lerp with `orthoSize = boardWidth / (fill × aspect)`, if you
need exact pinning.

## Board look

The board is deliberately flat: the scene backdrop (`backgroundColor`) with a
single outline framing the grid, and no per-cell planes. Two knobs:

- `Match3Config.SHOW_CELL_PLANES` (static) — turn cell planes back on to see the
  `GridCellObject.createVisual()` path. Static rather than an instance field
  because the grid module builds cell objects without DI access.
- `boardOutlineColor` / `boardOutlineThickness` / `boardOutlinePadding` — the
  outline is one ring mesh (outer rect + reverse-wound inner hole →
  `ShapeGeometry`), **not** `LineSegments`, because WebGL ignores `linewidth` and
  a mesh is the only way to control stroke width.

## Project structure

The `GameGrid` extension lives under `src/modules/gamegrid/`, mirroring the
module's own folder shape, so it stays separable from the app-level code.

```
match3
├──public
│   └──game-config.json          # runtime override channel (ships empty: {})
├──src
│   ├──controllers
│   │   └──GameScreenViewController.ts
│   ├──events
│   │   └──GameEvents.ts
│   ├──models
│   │   ├──GameModel.ts
│   │   └──IGameModel.ts
│   ├──modules
│   │   └──gamegrid
│   │       ├──controllers
│   │       │   └──GameBoardsViewController.ts
│   │       ├──models
│   │       │   └──GameBoardItem.ts
│   │       ├──views
│   │       │   ├──IGameBoardsView.ts
│   │       │   ├──GameBoardCellObject.ts
│   │       │   ├──GameBoardItemObject.ts
│   │       │   ├──GameBoardItemObjectOptions.ts
│   │       │   ├──GameBoardObjectCreator.ts
│   │       │   └──GameBoardsView.three.ts
│   │       └──Match3GameGridBinding.ts
│   ├──utilities
│   │   └──GameOperations.ts
│   ├──views
│   │   ├──IGameScreenView.ts
│   │   └──GameScreenView.pixi.ts
│   ├──Match3App.ts
│   ├──Match3AssetIds.ts
│   ├──Match3Config.ts
│   ├──Match3UIIds.ts
│   └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameBoardsView` (GridsView) | `GameBoardsViewController` | Gem board with selection, swap, match, gravity, and refill animations; owns the grid outline mesh |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD: score readout and settings button, inset by the safe area |
| `GameBoardCellObject` | — | Board cell: invisible box collider for pointer input, optional plane visual |
| `GameBoardItemObject` | — | Textured gem quad with halo highlight and GSAP animations |

> **Naming convention:** every per-board class — model (`GameBoardItem`), view (`GameBoardsView`), controller (`GameBoardsViewController`), view interface (`IGameBoardsView`), cell object, item object, item options, and object creator — is named `GameBoard*` rather than the game-specific `Match3*`. The names describe the *role* in the architecture (a thing that lives on the game's board), not the gameplay (a "gem"). Game-specific code (App, Config, AssetIds, Binding) keeps the `Match3*` prefix; generic in-app pieces (`GameOperations`, `GameEvents`, `GameScreenViewController`) drop the prefix. The in-domain logic class `GameOperations` uses the `*Operations` suffix rather than `*Service` because it's pure in-app logic (no external I/O).

## Events

| Event class | Signals | Flow |
|------------|---------|------|
| `GameEvents` | `onScoreChanged` | `GameBoardsViewController` emits after clearing matches, `GameScreenViewController` updates score display |
| `GameEvents` | `onPlaySfx` | Board controller emits a sfx id, `GameScreenViewController` forwards it to `AudioService` — the board never touches audio directly |

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
