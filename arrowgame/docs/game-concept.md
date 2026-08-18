# Arrow Nudge Escape - Game Concept

## Game Vision
A 3D-rendered sliding-block puzzle where every piece carries a fixed directional arrow. Tap a block and, if its arrow-side is clear, it slides off the board. Clear the whole board to win. Simple rule, satisfying "aha" moment when the right unlock order clicks.

## Target Audience
Casual puzzle players (hyper-casual / mid-core puzzle fans) who enjoy short, logic-based sessions (Unpuzzle / Unblock Me style audience).

## Core Mechanic
Tap a block → check the row/column of cells in the direction of its fixed arrow, out to the board edge → if all clear, block slides out and is removed. If blocked, block shakes in place (invalid feedback).

## Core Loop (15-20s cycle)
1. Scan the board, spot a block whose arrow-direction path is open.
2. Tap it → it slides out with a quick animation + sound.
3. This opens a path for another block.
4. Repeat until the board is empty → level complete → next level.

## Win/Lose Conditions
- **Win**: All blocks removed from the board.
- **Lose**: None (no fail state in prototype scope) — pure logic puzzle, player can always find a move if the level is well-formed. No moves counter/timer in this reduction-scope prototype.

## Visual Direction
3D-rendered scene (Three.js world via gamelabs) but gameplay logic is entirely on a flat 2D grid plane (single layer, viewed from top-down/slight-angle). Blocks are chunky glossy 3D-styled cubes with a visible arrow decal on top indicating their fixed slide direction. Bright, playful hyper-casual palette per user preference.

## Unique Selling Point
Classic Unpuzzle mechanic rendered with real 3D depth and lighting instead of flat 2D — sets up future levels with true 3D block shapes/layouts without changing the core rule.

## Scope Note (Prototype)
Per confirmed reduction scope: 3 hand-built levels, core mechanic only, minimal HUD (level indicator + restart button), no meta-progression, no monetization hooks. Levels are on a single Z-plane (2D grid) for now; 3D-shaped levels are a planned future iteration, not in this build.
