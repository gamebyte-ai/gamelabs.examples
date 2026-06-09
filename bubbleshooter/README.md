# Bubble Shooter Example

A bubble-shooter with a hex bubble grid, shooter at the bottom, dotted aim line with wall reflections, match-3 popping, floating-bubble drops, and bomb / fireball power-ups. Uses Three.js for the play field and PixiJS for the HUD.

## What it shows

- Composing a large world from many sub-views under a single root `GameAreaView`: bubble grid, shooter, flight, falling bubbles, aim line, effects, power-up collection
- `Front2dCameraController` with orthographic projection sized to fit the play area on every resize
- In-domain logic split out of controllers into utilities: `GameOperations`, `MatchFinder`, `FloatingBubbleFinder`, `AimTrajectoryCalculator`, `BubbleGridLayout`
- Using the `OnScreenControls` module for score / win / game-over labels and the bomb / fireball / aim-aid / settings buttons
- Using `ParticlesBinding` for pop-burst FX and `TimelineBinding` for power-up collection and count-bump tracks
- Using `SettingsBinding` (SFX-only) with `SettingsHookup` bridging persisted values to `AudioService`
- Synthesised SFX buffers registered straight on `AssetManager.setAsset()` — no network fetch
- Event-driven communication via a single `GameEvents` bus shared across model, controllers, and views
- Hand-ticked `ParticleManager` and `TimelineManager` from `onStep`

## Project structure

```
bubbleshooter
├──assets/                          (bubble svgs, power-ups, icons)
└──src
    ├──controllers/
    │   ├──GameAreaViewController.ts
    │   ├──GameScreenViewController.ts
    │   ├──BubbleGridViewController.ts
    │   ├──ShooterViewController.ts
    │   ├──FlightViewController.ts
    │   ├──AimLineViewController.ts
    │   ├──FallingBubblesViewController.ts
    │   ├──EffectsViewController.ts
    │   └──PowerUpCollectionViewController.ts
    ├──views/                       (mirror controllers; *.three.ts + *.pixi.ts + interfaces)
    ├──models/
    │   ├──BubbleGrid.ts / IBubbleGrid.ts
    │   ├──Shooter.ts / IShooter.ts
    │   ├──Score.ts / IScore.ts
    │   └──IAimTrajectory.ts
    ├──utilities/
    │   ├──GameOperations.ts
    │   ├──MatchFinder.ts
    │   ├──FloatingBubbleFinder.ts
    │   ├──AimTrajectoryCalculator.ts
    │   ├──BubbleGridLayout.ts
    │   ├──HudHookup.ts
    │   ├──SettingsHookup.ts
    │   ├──SoundManager.ts
    │   ├──SoundSynth.ts
    │   └──PowerUpCountBumpTrack.ts
    ├──constants/                   (BubbleColor, PowerUpKind, Levels, AimTrajectoryEnd)
    ├──events/GameEvents.ts
    ├──BubbleShooterApp.ts
    ├──BubbleShooterAssetIds.ts
    ├──BubbleShooterConfig.ts
    ├──BubbleShooterUIIds.ts
    └──main.ts
```

## Views and controllers

| View | Controller | Description |
|------|-----------|-------------|
| `GameAreaView` (WorldViewBase) | `GameAreaViewController` | Root world view; owns the play-area background and hosts sub-views |
| `BubbleGridView` (sub-view) | `BubbleGridViewController` | Renders settled bubbles; updates from `onBubblePlaced` / `onBubbleRemoved` |
| `ShooterView` (sub-view) | `ShooterViewController` | Bottom-centre shooter; current + next bubble, rotation, bomb / fireball overlay |
| `FlightView` (sub-view) | `FlightViewController` | Animates the bubble in flight from the shooter to its landing cell |
| `AimLineView` (sub-view) | `AimLineViewController` | Dotted aim line with wall reflections; visibility driven by the aim-aid toggle |
| `FallingBubblesView` (sub-view) | `FallingBubblesViewController` | Floating bubbles released by a match drop with gravity to the floor |
| `EffectsView` (sub-view) | `EffectsViewController` | Pop-burst particle emitter (uses `ParticleManager`) |
| `PowerUpCollectionView` (sub-view) | `PowerUpCollectionViewController` | Animates earned power-up icons flying to the HUD buttons (uses `TimelineManager`) |
| `GameScreenView` (ScreenView) | `GameScreenViewController` | HUD container; layout passes through to OSC labels and buttons |

## Events

| Signal | Emitted by | Listened by |
|--------|------------|-------------|
| `onBubblePlaced`, `onBubbleRemoved` | `GameOperations` | `BubbleGridView`, `EffectsView` |
| `onShooterColorChanged`, `onShooterNextColorChanged`, `onShooterAimChanged` | shooter controller / model | `ShooterView` |
| `onAimTrajectoryChanged` | `AimLineViewController` | `AimLineView` |
| `onFlyingBubbleChanged`, `onFlyingBombChanged` | flight controller | `FlightView` |
| `onBubblePopped` | `GameOperations` | `EffectsView` (particles), `SoundManager` |
| `onFallingBubbleChanged` | `FloatingBubbleFinder` flow | `FallingBubblesView` |
| `onScoreChanged` | `Score` model | OSC score label (`HudHookup`) |
| `onShooterBombChanged`, `onBombCountChanged`, `onFireballCountChanged` | `GameOperations` | shooter view, HUD count labels |
| `onAimAidVisibleChanged` | App (target-button toggle) | `AimLineView` |
| `onLayoutChanged` | App (after each resize fit) | screen view + sub-views needing reposition |

## Game flow

```
Player points → aim line recomputes (walls reflect, ends at top wall or first bubble)
Player clicks → GameOperations launches flight bubble
    Flight reaches contact:
        Snap to nearest empty hex neighbour
        MatchFinder: connected group of ≥ 3 same-colour bubbles → pop + score
        FloatingBubbleFinder: bubbles no longer connected to ceiling → fall
    Power-up button pressed → arms the shooter with bomb / fireball
        Bomb: clears a hex neighbourhood
        Fireball: clears a straight line of same-colour
    Cleared bubbles drop power-up icons → fly to HUD button → count bumps
Grid empty → "YOU WIN"
Bubble settles in bottom row → "GAME OVER"
```

## Running

```bash
npm install
npm run dev
```

## Playable-ad (single-page) build

`npm run playable:build` produces a single self-contained `dist-playable/index.playable.html`
with all JS, CSS, and assets inlined as `data:` URIs — no external requests, ready to upload
to an ad network as-is.

`npm run playable:dev` serves the same single-file entry locally (on port 5303) for QA.

It reuses the regular `src/main.ts` entry — Vite's single-file build automatically inlines
both the example's own `new URL(...)` assets and the framework's default UI textures, so no
extra wiring is needed.
