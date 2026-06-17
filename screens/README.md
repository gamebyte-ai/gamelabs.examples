# Screens Example

A minimal Gamelabs.js example demonstrating screen navigation using the built-in `MainScreen` and `LevelProgressScreen` modules. No custom views or controllers — this shows how to wire modules together with events and transitions.

## What it shows

- Using modules without any custom views or controllers
- Module asset overrides (`overrideRequestUrl` for the logo) before `addModule()`
- Screen navigation via `viewFactory.createScreenView()` with slide transitions
- Event-driven navigation between screens (`MainScreenEvents`, `LevelProgressScreenEvents`)
- Providing a custom model to a module (`LevelProgressModel` implementing `ILevelProgressScreenModel`)
- Using `UnsubscribeBag` for event subscription cleanup

## Project structure

```
screens
├──assets
│   └──example_logo.png
└──src
    ├──models
    │   └──LevelProgressModel.ts
    ├──ScreensApp.ts
    ├──ScreensConfig.ts
    └──main.ts
```

## Screen flow

```
MainScreen ──(play click)──► LevelProgressScreen
                                    │
MainScreen ◄──(back click)──────────┘
```

- `MainScreenEvents.onPlayClick` → navigates to LevelProgressScreen (slide down)
- `LevelProgressScreenEvents.onBackClick` → navigates back to MainScreen (slide up)

## Running

```bash
npm install
npm run dev
```
