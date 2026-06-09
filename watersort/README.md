# Water Sort Example

A puzzle game where the player sorts colored liquids into bottles. Tap a bottle to select it, then tap another to pour. Liquid pours only if the target's top color matches or the target is empty. All bottles sorted = level complete. Demonstrates pure PixiJS 2D gameplay with gsap tween animations.

## What it shows

- Pure PixiJS gameplay (no Three.js world view needed)
- Game model (`Bottle`) and operations utility (`WaterSortOperations`) for logic separation
- Procedural level generation with progressive difficulty (more colors each level)
- Gsap tween animations: bottle select/deselect lift, pour animation with tilt + rotation, liquid scale effects
- Concurrent pour support: multiple independent bottle pairs can animate simultaneously
- Per-bottle input blocking during active tweens
- `PopupView` for win flow with "Next Level" progression
- `ButtonComponent` usage for restart and next-level buttons
- Hyper-casual visual style with pastel background, glass bottle sprites, and shine overlays
- Programmatically generated PNG assets (background, bottle, shine, star)

## Gameplay

- Tap a bottle to select (lifts up)
- Tap another bottle to pour (source tilts and pours into target)
- Liquid pours only if target top color matches or target is empty
- The entire top group of same-colored segments pours at once
- All bottles sorted (single color) or empty = win
- Levels progress: starts with 3 colors + 2 empty bottles, adds a color each level (up to 8)

## Project structure

```
watersort
├──assets
│   ├──background.png
│   ├──bottle.png
│   ├──bottle_shine.png
│   └──star.png
└──src
    ├──controllers
    │   ├──GameScreenViewController.ts
    │   └──WinPopupViewController.ts
    ├──events
    │   └──GameEvents.ts
    ├──models
    │   └──Bottle.ts
    ├──utilities
    │   └──WaterSortOperations.ts
    ├──views
    │   ├──GameScreenView.pixi.ts
    │   ├──IGameScreenView.ts
    │   ├──IWinPopupView.ts
    │   └──WinPopupView.pixi.ts
    ├──WaterSortApp.ts
    ├──WaterSortAssetIds.ts
    ├──WaterSortConfig.ts
    ├──WaterSortUIIds.ts
    └──main.ts
```

## How to run

```bash
cd examples/watersort && npm install && npm run dev
```

## Playable-ad (single-page) build

```bash
npm run playable:build   # one self-contained dist-playable/index.playable.html
npm run playable:dev     # serve it locally on http://localhost:5315
```

`npm run playable:build` produces a single self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests are made when the
file is opened. `npm run playable:dev` serves the same entry point on port 5315 for QA.

Both commands reuse `src/main.ts` (the same game code as the normal build) via
`vite.playable.config.ts`. The single-file build inlines game assets and framework textures
automatically, so the resulting HTML can be dropped straight into an ad network as a playable.
