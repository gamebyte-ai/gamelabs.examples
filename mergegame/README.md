# mergegame

Skeleton for the Merge Game, scaffolded from `example_template`. One `GameScreen`
that renders the configured title over an empty world — a clean starting point,
no gameplay yet.

## Structure

```
mergegame
└──src
    ├──controllers
    │   └──GameScreenViewController.ts
    ├──views
    │   ├──IGameScreenView.ts
    │   └──GameScreenView.pixi.ts
    ├──MergeGameApp.ts
    ├──MergeGameConfig.ts
    ├──MergeGameUIIds.ts
    └──main.ts
```

- `MergeGameApp` — extends `GamelabsApp`, registers one screen, creates it in `postInitialize`.
- `GameScreenView` / `GameScreenViewController` — full-screen Pixi screen showing the title.
- `MergeGameConfig` — app-level values (title, screen transition); overridable via `public/game-config.json`.
- `MergeGameUIIds` — namespaced enum of UI IDs.

## Running

From the repo root: `./RunMergeGame.sh` — or here:

```bash
npm install
npm run dev   # http://localhost:5192
```

## Extending

- Add `MergeGameAssetIds.ts` and enqueue assets in `loadAssets()`.
- Add a world/board view + controllers for the merge grid.
- Add modules (camera, input) in `registerModules()`.
