# Castle Crushers Example

A single-level physics game: drag from the cannonball and flick toward a block castle to topple it and knock the golden crown off its pedestal. Demonstrates the optional **`physics2d`** module (matter-js) integrated the framework way — physics lives behind a manager, never in the view.

## What it shows

- **`Physics2DBinding` / `Physics2DManager`** (`@gamebyte/gamelabsjs/physics2d`): a DI-bound 2D physics world stepped on a fixed timestep, registered with the `UpdateManager` at order `-1000` so it runs before gameplay controllers each frame.
- **Game-objects view vs UI view (framework rule):** because this is a pure-2D game that needs no World-only tools, the game objects render with Pixi on the HUD **Content layer** (`GameView.pixi.ts`, a `HudViewBase` mounted via `hud.addChild(HudLayer.Content, …)`); the UI (`GameScreenView.pixi.ts`, a `ScreenView` on the Screen layer above) holds only the cannonball count + banner. (A game needing `gamecamera` / 3D particles / lighting would instead put its objects in a Three World view — see `avoidance`.) Either way the game/UI split is mandatory.
- **`Physics2DStage`** — prefab ergonomics: `CastleOperations` spawns each entity with one `stage.spawn(body, view.createEntity(...))` call (body in the central manager + a `Physics2DEntityView` adapter the game view returns). `sync()` pushes transforms each frame; `despawn()`/`clear()` tear bodies + graphics down together.
- **The boundary rule in practice:** `CastleOperations` (a `utilities/*Operations` class) owns all game rules — builds the level, launches projectiles, decides win/lose by reading body transforms. Views never touch physics.
- **No coordinate mapping:** physics runs in design space (pixels, y-down), which is exactly Pixi screen space, so transforms map 1:1 — no 2D↔3D conversion. `GameView` reports pointer input directly in design space.
- **Two controllers, one bus:** `GameViewController` (gameplay) and `GameScreenViewController` (HUD) communicate through `GameEvents` (ammo/status). Readonly `IGameModel` is exposed to controllers; only `CastleOperations` mutates `GameModel`.
- **Dynamic / static / kinematic** bodies: stacked dynamic blocks + crown, a static ground and pedestal.

## How to run

```bash
# from the repo that contains this example, with the framework built:
npm install
npm run dev   # http://localhost:5188
```

`matter-js` is an optional peer dependency of the framework and is listed in this example's `package.json`.

## Project structure

```
castlecrushers/src
├── CastleCrushersApp.ts            # binds physics2d; mounts GameView on HUD Content + the UI screen
├── CastleCrushersConfig.ts         # all level + physics tuning (design space, gravity, ammo, layout)
├── events/GameEvents.ts            # cross-controller bus: ammo/status (game controller → HUD controller)
├── models/                         # GameModel + readonly IGameModel (ammo, status)
├── utilities/CastleOperations.ts   # builds the level via Physics2DStage, launches, win/lose — all domain logic
├── controllers/
│   ├── GameViewController.ts       # gameplay: wires the entity factory, forwards input, publishes HUD state
│   └── GameScreenViewController.ts # HUD: reflects ammo/status onto the screen
└── views/
    ├── GameView.pixi.ts            # HUD Content layer: game objects (Pixi) + aim line + pointer; never reads physics
    └── GameScreenView.pixi.ts      # HUD Screen layer: cannonball count + banner (UI only)
```

## Playable-ad (single-page) build

```bash
npm run playable:build   # → dist-playable/index.playable.html
npm run playable:dev     # serve the playable on http://localhost:5304
```

`npm run playable:build` produces one self-contained `dist-playable/index.playable.html` with all JS, CSS, and assets inlined as `data:` URIs — no external requests. `npm run playable:dev` serves it on port `5304`. The playable reuses the regular `src/main.ts` entry; Vite single-file (`vite-plugin-singlefile`) inlines the bundled assets and framework textures automatically.
