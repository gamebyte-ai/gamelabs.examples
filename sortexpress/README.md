# Sort Express

A Sort Express playable built on the gamelabs.js framework (PixiJS HUD).

This first step is the scaffold: a single full-screen HUD screen showing the
title **Sort Express** and a tap-to-start prompt. Tapping emits a gameplay
`start` event (currently just logged). The game flow is layered on step by step.

## Structure

```
sortexpress
└──src
    ├──constants/                  (game-state enums, tables — added later)
    ├──controllers
    │   └──GameScreenViewController.ts
    ├──events
    │   └──GameplayEvents.ts        start
    ├──models/                     (game state — added later)
    ├──services
    │   └──StoreService.ts         end-card store CTA
    ├──utilities/                  (managers / helpers — added later)
    ├──views
    │   ├──GameScreenView.pixi.ts
    │   └──IGameScreenView.ts
    ├──SortExpressApp.ts           (extends GamelabsApp)
    ├──SortExpressAssetIds.ts
    ├──SortExpressConfig.ts
    ├──SortExpressUIIds.ts
    └──main.ts
```

## Running

```bash
npm install
npm run dev      # http://localhost:5192
```

Or from the repo root: `./RunSortExpress.sh`
