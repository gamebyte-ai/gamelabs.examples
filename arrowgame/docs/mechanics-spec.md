# Arrow Nudge Escape - Mechanics Specification

## Grid and Board Coordinates
The game board is a 2D grid plane rendered in a 3D space.
- **Grid Size**: Variable per level (e.g., 4x4, 5x5, 6x6).
- **Coordinate System**: Column (X) and Row (Y) starting from top-left (0,0).
- **Cell Size**: Each cell is exactly 1.0 x 1.0 units in 3D space.
- **Z-Plane**: All blocks sit on the Z = 0 plane (or Y = 0 plane depending on camera orientation. In our Three.js setup, we will place the grid on the XZ plane, so blocks sit on the Y = 0 plane, with X as columns and Z as rows).

## Block Properties
Each block is a 3D cube with the following properties:
- **Dimensions**: 0.9 x 0.9 x 0.9 units (slightly smaller than cell size to leave a visual gap).
- **Direction**: A fixed cardinal direction (UP, DOWN, LEFT, RIGHT).
- **State**: `IDLE` (on board), `SLIDING` (moving off board), `REMOVED` (off board).
- **Color**: Distinct color per block (red, blue, yellow, green, orange) to make the board visually vibrant.

## Slide Mechanics
When a block is clicked:
1. **Direction Check**: Identify its fixed arrow direction.
   - **UP**: Decreasing Row index (Z decreases).
   - **DOWN**: Increasing Row index (Z increases).
   - **LEFT**: Decreasing Column index (X decreases).
   - **RIGHT**: Increasing Column index (X increases).
2. **Obstacle Check**: Scan all cells from the block's current position to the edge of the board in the arrow direction.
   - If ANY cell along this path contains another block, the path is **BLOCKED**.
   - If all cells along this path are empty, the path is **CLEAR**.
3. **Action Execution**:
   - **If CLEAR**:
     - Set block state to `SLIDING`.
     - Animate the block sliding along its arrow direction past the board edge (e.g., slide 10 units away).
     - Play slide sound effect.
     - Once animation completes, set state to `REMOVED`, remove the block from the grid model, and destroy its 3D mesh.
     - Check win condition.
   - **If BLOCKED**:
     - Play error/blocked sound effect.
     - Animate a quick "shake" effect on the block (slight nudge in arrow direction and back, 100ms duration).

## Win Condition
- **Check Trigger**: Evaluated immediately after a block begins its slide animation.
- **Condition**: If the number of remaining blocks on the board is 0.
- **Action**: Transition to Level Complete screen after a 500ms delay (allowing the last block to slide off-screen).

## Level Definitions (Hand-built for Prototype)
We will define 3 levels in the config:

### Level 1 (3x3 Grid - Tutorial)
- Grid Size: 3x3
- Blocks:
  - Cell (1, 1): Arrow RIGHT (Blocked initially by 2,1)
  - Cell (2, 1): Arrow RIGHT (Clear! Can slide out right)
  - Cell (1, 2): Arrow DOWN (Clear! Can slide out down)
- Solution:
  1. Slide (1, 2) DOWN or (2, 1) RIGHT.
  2. Slide (1, 1) RIGHT (now clear because 2,1 is gone).

### Level 2 (4x4 Grid - Interlocking)
- Grid Size: 4x4
- Blocks:
  - Cell (1, 1): Arrow DOWN (Blocked by 1,2)
  - Cell (1, 2): Arrow RIGHT (Blocked by 2,2)
  - Cell (2, 2): Arrow UP (Blocked by 2,1)
  - Cell (2, 1): Arrow LEFT (Clear! Can slide out left)
- Solution:
  1. Slide (2, 1) LEFT.
  2. Slide (2, 2) UP (now clear).
  3. Slide (1, 2) RIGHT (now clear).
  4. Slide (1, 1) DOWN (now clear).

### Level 3 (5x5 Grid - Spiral)
- Grid Size: 5x5
- Blocks:
  - Cell (2, 1): Arrow RIGHT (Blocked by 3,1)
  - Cell (3, 1): Arrow DOWN (Blocked by 3,2)
  - Cell (3, 2): Arrow LEFT (Blocked by 2,2)
  - Cell (2, 2): Arrow UP (Clear! Can slide out up)
  - Cell (1, 2): Arrow RIGHT (Blocked by 2,2)
  - Cell (3, 3): Arrow DOWN (Clear! Can slide out down)
- Solution:
  1. Slide (3, 3) DOWN and (2, 2) UP.
  2. Slide (3, 2) LEFT (now clear).
  3. Slide (3, 1) DOWN (now clear).
  4. Slide (2, 1) RIGHT (now clear).
  5. Slide (1, 2) RIGHT (now clear).
