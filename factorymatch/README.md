# Factory Match Example

A 3D physics collector: shapes tumble into a bin (green cubes, yellow cylinders, blue plus-prisms, purple triangular prisms); tap a shape to pull it into the slot tray, and line up **3 of a kind** to clear them and score. Demonstrates the optional **`physics3d`** module (cannon-es) — physics lives behind a manager, never in the view.

## What it shows

- **`Physics3DBinding` / `Physics3DManager`** (`@gamebyte/gamelabsjs/physics3d`): a DI-bound 3D physics world stepped on a fixed timestep, registered with the `UpdateManager` at order `-1000` so it runs before gameplay controllers. The pile stacks/settles under gravity (cannon-es).
- **Game objects in the World view (framework rule):** `PileView.three.ts` (a `WorldViewBase`) renders the bin + shapes + the 3D slot rack as Three.js meshes; the HUD (`FactoryScreenView.pixi.ts`, a `ScreenView`) is UI only — score + banner. A fixed perspective camera looks down into the bin.
- **Decoupled collider vs. visual walls:** the glass walls render short, but their colliders extend well above them (`wallColliderHeight`), so the tumbling pile can't bounce out of the bin while the bin still looks open.
- **`Physics3DStage`** — prefab ergonomics: `FactoryOperations` spawns each pile shape with one `stage.spawn(body, view.createEntity(...))` call; `despawn()` removes body + mesh together; `sync()` pushes transforms each frame. (The bin colliders are created directly on the manager — no mesh — while the view draws the glass bin; clean collider/visual separation.)
- **Filtered raycast picking:** a click becomes a world-space ray (camera ray); `FactoryOperations` calls `physics.raycast(..., { collisionMask: 1 })` so the ray passes through the bin (collision group 2) and only hits pile shapes (group 1). The view reports the ray; operations does the hit test — engine types never leak.
- **Pick → fly to a 3D slot:** picking despawns the shape's physics body (collider off) and the view spawns a slot mesh at that pose, which **flies** (GSAP) into the 3D slot rack in front of the bin, **shrinking to a quarter of its size** on the way down. The rack shows **visible slot pads** even when empty. Lining up 3 of a kind **pops** them (scale-out) and the rest **slide** over to close the gap — no single-frame jumps.
- **The boundary rule in practice:** `FactoryOperations` (a `utilities/*Operations` class) owns all rules — builds the bin + pile, resolves picks, runs the slot/match logic, decides win/lose, and returns a `CollectResult` the view animates. Views never touch physics.
- **Two controllers, one bus:** `PileViewController` (gameplay + slot animation) and `FactoryScreenViewController` (HUD) communicate through `GameEvents` (score/status). Readonly `IGameModel` is exposed to controllers; only `FactoryOperations` mutates `GameModel`.

## How to run

```bash
# from the repo that contains this example, with the framework built:
npm install
npm run dev   # http://localhost:5189
```

`cannon-es` is an optional peer dependency of the framework and is listed in this example's `package.json`; `gsap` (a framework dependency) drives the slot animations.

## Notes

- **Box-collider approximation:** every shape uses a box collider sized to its footprint (the `physics3d` module ships sphere/box/plane shapes). The distinct *meshes* (cube / cylinder / plus / triangular prism) give the gameplay-relevant difference; box colliders keep the pile tidy (no rolling). Per-kind convex/cylinder colliders would be a `physics3d` follow-up.
- Spawning `6` of each kind (a multiple of the match count) makes the bin fully clearable → win. Overfilling the `7`-slot rack without a match → lose.

## Project structure

```
factorymatch/src
├── FactoryMatchApp.ts              # binds physics3d; mounts PileView in World + the UI screen
├── FactoryMatchConfig.ts           # bin (incl. tall collider), shapes, spawn, slot rules, rack, anim, camera
├── events/GameEvents.ts            # cross-controller bus: score/status (pile controller → HUD)
├── models/                         # GameModel + readonly IGameModel (score, status)
├── utilities/FactoryOperations.ts  # bin colliders + pile via Physics3DStage, filtered raycast pick, match rules
├── controllers/
│   ├── PileViewController.ts       # gameplay: wires the entity factory, forwards pick rays, drives slot animation
│   └── FactoryScreenViewController.ts # HUD: reflects score/status
└── views/
    ├── PileView.three.ts           # World: bin + pile + 3D slot rack (GSAP fly/slide/pop) + pick ray
    └── FactoryScreenView.pixi.ts   # HUD: score + banner (UI only)
```
