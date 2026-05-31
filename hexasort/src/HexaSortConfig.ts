/**
 * Tuning for the hex grid scene.
 *
 * Grid size is configurable so the same rendering pipeline scales to any
 * (cols × rows). The current Hexa Sort milestone uses 5 × 5.
 */
export class HexaSortConfig {
  public static readonly GRID_ID = 1;

  /** Hex grid size in offset coordinates. */
  public readonly cols = 5;
  public readonly rows = 5;

  /** Hex tile radius in world units (flat-top: corner-to-center). */
  public readonly hexSize = 0.40;

  /**
   * Visible hex fill ratio. 1.0 makes cells meet edge-to-edge (no gaps);
   * a dark outline separates them visually. Kept configurable for tuning.
   */
  public readonly hexFillRatio = 1.0;

  /** Vertical extrusion of each hex prism (world units). */
  public readonly hexHeight = 0.1;

  /** Base cell face color. */
  public readonly cellColor = 0x334155;

  /** Cell edge (outline) color. */
  public readonly cellEdgeColor = 0x0f172a;

  /** Cell face color while it is a valid drop target under the pointer. */
  public readonly cellHighlightColor = 0x38bdf8;

  /** Orbital camera distance from the grid center (world units). */
  public readonly cameraDistance = 7;

  /**
   * Orbital camera pitch in radians (angle above the XZ plane).
   * `0` is on the horizon; `π/2` is directly overhead. ~0.8 gives a clearly
   * tilted view so both the prism height and Y-rotation are visible.
   */
  public readonly cameraPitch = 1.0;

  /**
   * Drag-rotation sensitivity, in radians of Y rotation per CSS pixel of
   * horizontal pointer movement. A full screen-width drag at 800 px rotates
   * the grid by `800 * dragRotationSensitivity` radians.
   */
  public readonly dragRotationSensitivity = 0.005;

  /** Palette indexed by `Block.colorIndex`. */
  public readonly blockColors: readonly number[] = [
    0xef4444, // red
    0x22c55e, // green
    0x3b82f6, // blue
    0xeab308, // yellow
  ];

  /** Height of a single placed block prism (world units). */
  public readonly blockHeight = 0.1;

  /** Fixed world position of the stacks tray in front of the grid. */
  public readonly trayPosition = { x: 0, y: 0, z: 3.2 };

  /** Horizontal spacing between stack slots in the tray (world units). */
  public readonly traySlotSpacing = 1.8;

  /** Vertical lift applied to a stack that is currently being dragged. */
  public readonly stackLiftHeight = 0.5;

  /**
   * Initial contents of the three tray slots. Each inner array is a stack of
   * block color indices rendered bottom → top.
   */
  public readonly initialStacks: readonly (readonly number[])[] = [
    [0, 0, 1, 1],
    [3, 3, 2, 1],
    [2, 1, 1, 1],
  ];

  /** Number of blocks in a freshly spawned stack (used when refilling a consumed tray slot). */
  public readonly spawnedStackLength = 4;

  /** Fixed interval between single-block sort moves (seconds). */
  public readonly sortStepSeconds = 0.1;

  /** Delay between finishing one color's clustering and starting the next (seconds). */
  public readonly colorCooldownSeconds = 0.15;

  /**
   * Number of contiguous same-color blocks on a cell's top that triggers
   * destruction of that stretch. Reached during or at the end of a cluster's
   * consolidation.
   */
  public readonly destructionThreshold = 10;

  /** Delay between each block removal during destruction (seconds). */
  public readonly destructionStepSeconds = 0.05;

  /**
   * GSAP tween duration for a sort move (a block travelling from source
   * cell top to target cell top). The scheduler waits for this animation
   * to finish before starting its {@link sortStepSeconds} between-step
   * interval, so step cadence = `animSortMoveSeconds + sortStepSeconds`.
   */
  public readonly animSortMoveSeconds = 0.1;

  /**
   * GSAP tween duration for a destruction (top block scales to zero and
   * is removed). The scheduler waits for this animation to finish before
   * starting its {@link destructionStepSeconds} interval.
   */
  public readonly animDestroyScaleSeconds = 0.05;

  /**
   * Peak Y lift (in world units) above the higher of start/end during
   * the block's flight arc. Drives the parabolic "tossing" trajectory —
   * 0 disables the arc and the tile slides flat.
   */
  public readonly animFlipArcHeight = 0.6;

  /**
   * Number of full 2π rotations performed during the block's flight.
   * `1` is one end-over-end tumble; higher values spin faster. The
   * rotation axis is computed from the motion direction so the flip is
   * always perpendicular to the travel vector (a card-flip motion).
   */
  public readonly animFlipRevolutions = 1;
}
