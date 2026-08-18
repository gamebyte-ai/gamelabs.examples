# Arrow Nudge Escape - Implementation Framework

## User Request (Exact Quote)
"ok bulmaca oyunlarından istiyorum. objeye tıklanınca üstündeki okun gösterdiği yönde engel yoksa obje o yöne ilerliyor. oyun 3 boyutlu olsun. şimdilik oluşturulan bölümler 2d düzlem de olsun. daha sonra 3 boyutlu şekillerin olduğu bölümler de isticem."

## Core Requirements Checklist
- [x] 3D rendered scene (Three.js)
- [x] 2D plane grid layout for blocks (for now)
- [x] Click/tap on block to slide it in its arrow direction
- [x] Slide only if no obstacles in that direction
- [x] Level complete when all blocks are removed

## Technical Decisions
- **Framework**: Gamelabs.js (v4.2.0) with Three.js (World) and PixiJS (HUD)
- **3D Engine**: Three.js (direct dependency)
- **2D Engine**: PixiJS (direct dependency)
- **State Management**: Simple reactive state model (`GameState.ts` in utilities)
- **Grid System**: Custom lightweight 2D grid model on top of Three.js (since we are in REDUCTION scope, we will implement a simple grid model directly in the game code to keep it extremely lightweight and fast to iterate, rather than pulling in the full `gamegrid` module which is heavy and designed for complex board games).

## Sprint Plan

### Sprint 1: Splash Screen
- [ ] GameByte logo display (`/public/logo.svg`)
- [ ] Animated game-specific logo "ARROW ESCAPE"
- [ ] Transition to Loading Screen

### Sprint 2: Loading Screen
- [ ] Game logo display
- [ ] Progress indicator (0% to 100%)
- [ ] "Built with GameByte" branding at bottom
- [ ] Preload assets (textures, audio)

### Sprint 3: Main Menu
- [ ] Polished menu UI overlay (PixiJS)
- [ ] Big animated "PLAY" button
- [ ] Sound toggle button (Mute/Unmute)
- [ ] Level selection nodes (Level 1, 2, 3)

### Sprint 4: Core 3D Scene & Grid Setup
- [ ] Set up Three.js scene, camera (angled top-down), and lighting
- [ ] Render 3D grid board (recessed slots)
- [ ] Render 3D blocks (glossy cubes) with arrow textures on top

### Sprint 5: Click & Slide Mechanics
- [ ] Implement Raycasting to detect clicks on 3D blocks
- [ ] Implement obstacle check algorithm in arrow direction
- [ ] Implement slide animation (GSAP/tween) for successful moves
- [ ] Implement shake animation for blocked moves

### Sprint 6: Level Progression & HUD
- [ ] HUD overlay (PixiJS) showing current level and Restart button
- [ ] Level complete overlay with Next button
- [ ] Sound effects integration (slide, blocked, win, click)
- [ ] LocalStorage persistence for high score / level unlocked

## File Structure Reference
```
/workspace/
├── public/
│   ├── assets/
│   │   ├── images/         # Textures, logos, buttons
│   │   └── audio/          # SFX, BGM
│   └── logo.svg            # GameByte logo
├── src/
│   ├── MyGameApp.ts        # App entry
│   ├── MyGameConfig.ts     # Game constants
│   ├── MyGameUIIds.ts      # Screen/Popup IDs
│   ├── main.ts             # Bootstrapper
│   ├── controllers/
│   │   └── GameScreenViewController.ts # Coordinates view and state
│   ├── views/
│   │   ├── IGameScreenView.ts          # View interface
│   │   ├── GameScreenView.pixi.ts      # PixiJS HUD and UI overlay
│   │   └── GameScreenView.three.ts     # Three.js 3D world view
│   └── utilities/
│       ├── GameState.ts    # Reactive game state
│       └── LevelData.ts    # Level layouts and definitions
└── docs/
```

## Quick Reference Values
- **Block Size**: 0.9 x 0.9 x 0.9 units
- **Cell Size**: 1.0 x 1.0 units
- **Slide Speed**: 15.0 units/sec (GSAP duration calculated based on distance)
- **Shake Duration**: 0.15 seconds
- **Camera Position**: `(0, 8, 6)` looking at `(0, 0, 0)` (angled top-down)

## Sprint Progress Log
| Sprint | Status | Notes |
|--------|--------|-------|
| 1 | ⏳ | Pending |
| 2 | ⏳ | Pending |
| 3 | ⏳ | Pending |
| 4 | ⏳ | Pending |
| 5 | ⏳ | Pending |
| 6 | ⏳ | Pending |
