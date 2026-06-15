import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";
import { BoardKind } from "./constants/BoardKind";
import { BoosterType } from "./constants/BoosterType";
import { PieceRotationCalculator } from "./utilities/PieceRotationCalculator";

/**
 * Vertical gradient stops in `0xRRGGBB`. `top` paints the top edge
 * of the camera viewport, `bottom` paints the bottom edge; the
 * boards view rasterises this into a 1×N `CanvasTexture` and
 * assigns it to `world.scene.background`.
 */
export interface BackgroundGradientConfig {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Game-screen background gradients. The default paints the whole
 * screen during normal play; the selecting variant darkens
 * everything while a target-selection booster is pending so the
 * grid stands out. Tray Refresh is instant (no Selecting state) so
 * it never triggers the variant.
 */
export interface BackgroundColorsConfig {
  readonly default: BackgroundGradientConfig;
  /** Applied while the booster panel is in `Selecting` and the
   *  selected booster is a target-selection booster (Hammer or
   *  Unit Block). Reverts to {@link default} once the booster is
   *  consumed or cancelled. */
  readonly selecting: BackgroundGradientConfig;
}

/**
 * Unit Block booster — the temp single-cell piece the player drags
 * during Unit Block Selecting. Position is in world units relative
 * to the tray's geometric centre, so the default `{x: 0, z: 0}`
 * parks the block at the tray centre and a non-zero offset shifts
 * it from there. The block's colour is sampled from the regular
 * `blockColors` palette at entry so the temp piece reads as a
 * normal game block.
 */
export interface UnitBlockBoosterConfig {
  readonly trayPositionOffset: { readonly x: number; readonly z: number };
}

/**
 * Sparkle / radiance particles emitted by the temp 1-cell piece
 * while Unit Block is in Selecting. Continuous emission at `rate`
 * particles per second. Each particle is a 5-pointed star at a
 * random initial radius within `emitRadius` of the block's centre,
 * drifting outward at `driftSpeed` over `lifetimeSeconds` while its
 * alpha follows `sin(π·progress)` — appear, brighten, fade.
 *
 * Emission stops the moment the block is hidden (drag begin) or
 * removed (placement / cancel) — particles already in flight just
 * finish their lifetime.
 */
export interface UnitBlockSparklesConfig {
  readonly rate: number;
  readonly maxParticles: number;
  readonly lifetimeSeconds: number;
  readonly emitRadius: number;
  readonly starOuterRadius: number;
  readonly starInnerRadius: number;
  readonly driftSpeed: number;
  readonly color: number;
}

/**
 * Hammer-booster particle burst. When the hammer empties a cell,
 * the view spawns `count` flat coloured particles at the cell's
 * world position; each gets a random initial speed in
 * `[spawnSpeedMin, spawnSpeedMax)`, a random in-plane direction,
 * and is accelerated toward screen-down (`+Z` in world space) by
 * `gravity`. Each particle fades from full to zero opacity over
 * `lifetime` seconds. Sizes are in world units; speeds are world
 * units / second; gravity is world units / second².
 */
export interface HammerParticlesConfig {
  readonly count: number;
  readonly size: number;
  readonly spawnSpeedMin: number;
  readonly spawnSpeedMax: number;
  readonly gravity: number;
  readonly lifetime: number;
}

/**
 * Per-block wobble while the Hammer booster is in Selecting. The
 * controller drives a time accumulator; the view applies a
 * `sin(2π · frequencyHz · t + phase)` rotation around each grid
 * block's vertical axis, with the per-block `phase` lazily picked
 * uniformly from `[0, phaseRandomnessRange)` so the grid doesn't
 * read as synchronised. Amplitude is in degrees (converted at the
 * apply site).
 *
 * Only Hammer Selecting triggers it; Unit Block Selecting does
 * not.
 */
export interface HammerWobbleConfig {
  readonly amplitudeDegrees: number;
  readonly frequencyHz: number;
  readonly phaseRandomnessRange: number;
}

/**
 * Background panel + separator visuals for the playing grid. The
 * panel is a rounded rectangle, `padding` world units larger than
 * the grid on every side, drawn in `panelColor` — visible as a
 * border around the cell area. The separator is a regular rectangle
 * exactly the grid's cell extent in `separatorColor`, drawn on top
 * of the panel and below the cell fills, so the 8% inset between
 * adjacent cell fills reads as `separatorColor`. The per-cell
 * outline colour for the Grid surface mirrors `separatorColor` so
 * the cell border line blends with the gap backplate.
 */
export interface GridBackgroundPanelConfig {
  readonly padding: number;
  readonly cornerRadius: number;
  readonly panelColor: number;
  readonly separatorColor: number;
}

export interface BoardPalette {
  /** Cell fill colour. Tray slots are intentionally larger and lighter
   *  than grid cells so the two surfaces read as distinct at a glance. */
  readonly cellFill: number;
  /** Thin border on each cell. Doubles as the surface accent. */
  readonly cellOutline: number;
  /** When `false`, the cell renders no visible fill or outline — the
   *  background is whatever lies behind it. The fill mesh is still
   *  built (kept invisible via material opacity) because the boards
   *  view uses it as the hit target for picking up tray pieces. */
  readonly drawBackground?: boolean;
}

/**
 * Stable identifier each grid registers with `GridsModel` under. Kept
 * as a const enum'-style numeric record so the cell view can look up
 * the {@link BoardKind} of any grid it is rendering by id alone.
 */
export interface BoardIds {
  readonly grid: number;
  readonly tray: number;
}

/**
 * 2D shape of a piece, expressed as a list of `(col, row)` offsets
 * within the piece's own bounding box. `(0, 0)` is the top-left
 * corner; the visual centres the bounding box on its host cell so
 * pieces of different sizes all sit nicely inside a tray slot or
 * snap onto a single anchor cell on the playing grid.
 */
export type PieceCells = readonly (readonly [number, number])[];

export interface PieceType {
  /** Stable string id, used only for logging / debugging — the
   *  runtime references pieces by object identity. */
  readonly name: string;
  /** Block layout. See {@link PieceCells}. */
  readonly cells: PieceCells;
}

/**
 * Visual constants for the drag pipeline. The lifted piece floats
 * above the grid plane while following the pointer; the ghost
 * preview snaps onto the candidate footprint cells and onto the
 * cells of any rows/columns that would clear on drop.
 *
 * Y-layering (top-down ortho camera; higher Y wins depth test):
 *
 * - grid cell paint: 0.005 / 0.01
 * - **ghost preview: above placed blocks** so the line-clear
 *   highlight reads on top of cells already occupied by other
 *   pieces (otherwise the only visible part of the highlight is
 *   the empty footprint cells).
 * - placed blocks (`PieceMeshBuilder.DEFAULT_BLOCK_Y = 0.05`).
 * - lifted piece: well above everything else.
 */
export interface DragConfig {
  /** World Y at which the lifted piece floats. */
  readonly liftedY: number;
  /** World Y the ghost preview renders at. */
  readonly ghostY: number;
  /** Alpha applied to **ghost-preview** cells — the cells the piece
   *  itself would occupy on drop. Line-clear highlight cells (the
   *  rest of the rows/cols that would clear) deliberately render
   *  fully opaque to completely replace the underlying colour and
   *  read as "this is about to disappear", separate from the
   *  translucent "this is where the piece would land" feel. */
  readonly ghostOpacity: number;
  /** Vertical world-space lift applied to the lifted piece on drag
   *  start: the piece's anchor is shifted by this many units in the
   *  -Z direction (screen-up under the top-down camera) on top of
   *  the natural grab offset. Larger values pull the piece further
   *  above the finger / cursor so it stays visible during drag. */
  readonly pickupLift: number;
  /**
   * Pointer-area margin around the playing grid, in cell-size units.
   * Placement is active whenever the pointer (ground projection)
   * lies within the grid bbox extended by this margin on every
   * side; outside the area no ghost is shown and a drop snaps the
   * piece back to its tray slot.
   *
   * Inside the area, the raw target cell is computed from the
   * piece's top-left (round-to-nearest) and then **clamped** so the
   * full piece footprint fits inside the grid — out-of-bounds is
   * never a reason to reject a placement, only cell occupancy is.
   * This gives the piece a magnetic-to-edges feel: a large piece
   * dragged toward a corner sticks to that corner regardless of
   * which part of the piece the pointer was grabbed.
   *
   * Default `0.5` extends the placement zone by half a cell on every
   * side; raise it to give the player more leeway around the grid
   * edges, lower it for a tighter pointer-area gate.
   */
  readonly pointerAreaMargin: number;
  /** Glowing frame drawn around any row / column the ghost preview
   *  would clear. Rendered in addition to the recoloured clear-line
   *  cells so the player sees both signals (cells about to vanish
   *  + outlined line bounds). */
  readonly clearPreviewOutline: ClearPreviewOutlineConfig;
}

/**
 * Visual tuning for the row / column outline shown on the ghost
 * preview when a drop would trigger a line clear. The outline is
 * built from rectangle strips — an inner solid frame at full alpha
 * plus an outer halo frame at reduced alpha — to fake a glow under
 * vanilla Three.js (no post-processing). All sizes in world units.
 */
export interface ClearPreviewOutlineConfig {
  readonly color: number;
  /** Thickness of the inner solid frame strips. */
  readonly thickness: number;
  readonly haloColor: number;
  /** Alpha applied to the outer halo strips. */
  readonly haloAlpha: number;
  /** Extra outset (per side) of the halo frame outside the inner
   *  frame, in world units. */
  readonly haloPadding: number;
}

export type TimeDirection = "up" | "down";
export type TimeDisplayFormat = "mm:ss" | "hh:mm:ss" | "ss";

/**
 * HUD time configuration. `startSeconds` is the initial display
 * value; `direction = "up"` adds elapsed time to it, `"down"` ticks
 * toward zero from it. `displayFormat` controls how the rendered
 * label looks. Same shape as Solitaire's `TimeConfig` so the same
 * `TimeFormatter` works for both.
 */
export interface TimeConfig {
  readonly startSeconds: number;
  readonly direction: TimeDirection;
  readonly displayFormat: TimeDisplayFormat;
}

/**
 * Visual definition of one button in the booster panel. The HUD
 * draws a filled circle in `color` and overlays a procedural icon
 * chosen by `BoosterType` (hammer / plus / recycle). `label` is
 * kept for accessibility / debug surfaces; the panel UI itself no
 * longer renders it now that icons replaced text labels.
 */
export interface BoosterButtonConfig {
  readonly color: number;
  readonly label: string;
}

/**
 * Floating cancel-button visuals. Positioned at
 * `(offsetX, offsetY)` from the centre of the **selected** booster
 * button while in Selecting; hidden in every other state.
 */
export interface BoosterCancelButtonConfig {
  readonly size: number;
  readonly backgroundColor: number;
  readonly iconColor: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Booster panel + progress-bar tunables. The HUD renders the panel
 * bottom-pinned; the progress bar sits directly above it. Buttons
 * are visually-distinguishable rectangles (`buttons[type].color +
 * .label`); the progress bar fills left to right in
 * `progressFillColor`. All dimensions in screen pixels.
 */
export interface BoosterPanelConfig {
  /** Number of line clears (one per cleared row or column)
   *  required to charge the panel. */
  readonly stagesPerCharge: number;
  /** Distance from the screen bottom to the bottom of the panel. */
  readonly bottomMargin: number;
  readonly buttonSize: number;
  /** Horizontal gap between adjacent buttons. */
  readonly buttonSpacing: number;
  /** Alpha when the panel is Ready (active). */
  readonly buttonActiveAlpha: number;
  /** Alpha when the panel is Charging (buttons disabled). */
  readonly buttonInactiveAlpha: number;
  readonly buttonLabelFontSize: number;
  readonly buttonLabelColor: number;
  /** Per-booster visual settings, keyed by `BoosterType`. */
  readonly buttons: Readonly<Record<BoosterType, BoosterButtonConfig>>;
  /** Vertical gap between the bottom of the progress bar and the
   *  top of the button row. */
  readonly progressGapAbove: number;
  readonly progressWidth: number;
  readonly progressHeight: number;
  readonly progressFillColor: number;
  readonly progressTrackColor: number;
  /** Text shown in place of the progress bar while Ready, when the
   *  player has at least one placeable tray piece. */
  readonly readyLabelChooseOne: string;
  /** Text shown in place of the progress bar while Ready, when no
   *  tray piece is placeable. Acts as a "use a booster to recover"
   *  prompt — the new game-over rule lets the player live until the
   *  next Charging state. */
  readonly readyLabelNoMoves: string;
  readonly readyLabelFontSize: number;
  readonly readyLabelColor: number;
  /** Filled rectangle drawn behind the buttons + bar. Defines the
   *  panel's visual footprint at the bottom of the screen. */
  readonly panelBackgroundColor: number;
  /** Padding between the panel content and the background's edge. */
  readonly panelPadding: number;
  /** Corner radius of the panel background. */
  readonly panelCornerRadius: number;
  /** Multiplier applied to the selected booster button's scale
   *  while in Selecting (e.g. `1.2` = "scale up 20%"). */
  readonly selectedScale: number;
  /** Floating X cancel button shown over the selected booster. */
  readonly cancel: BoosterCancelButtonConfig;
  /** Instruction text shown in the combo widget's position while a
   *  Hammer Selecting is pending. The combo indicator (label +
   *  circles) is hidden while this prompt is visible. */
  readonly selectingPromptHammer: string;
  /** Instruction text shown in the combo widget's position while a
   *  Unit Block Selecting is pending. */
  readonly selectingPromptUnitBlock: string;
}

/**
 * Combo HUD widget tunables. The widget renders `maxMoves` circles
 * at the top centre of the screen with a state-driven label above
 * them; circles flip between `circleColorActive` (combo still has
 * moves) and `circleColorInactive` (depleted / inactive). All
 * dimensions in screen pixels.
 */
export interface ComboConfig {
  /** Number of circles AND the cap on `movesRemaining`. A combo
   *  survives this many no-clear placements before deactivating. */
  readonly maxMoves: number;
  readonly circleRadius: number;
  /** Edge-to-edge gap between adjacent circles. */
  readonly circleSpacing: number;
  readonly circleColorActive: number;
  readonly circleColorInactive: number;
  /** Fraction of the gap between the screen top and the grid top
   *  at which the combo *label* is centered. Independent of the
   *  circles' anchor so each component is positioned directly
   *  relative to the grid distance. Range `[0, 1]`. */
  readonly labelBiasRatio: number;
  /** Same as `labelBiasRatio` but for the row of circles. Typically
   *  larger than `labelBiasRatio` so the circles sit below the
   *  label (closer to the grid). */
  readonly circlesBiasRatio: number;
  /** The "designed" world-units-to-pixels ratio for the combo
   *  widget. The HUD view scales the whole widget by
   *  `currentPxPerWorld / referencePxPerWorld`, so the combo's
   *  pixel-defined sizes (font, circle radius, spacing) track the
   *  grid's on-screen size as the viewport changes. */
  readonly referencePxPerWorld: number;
  readonly labelFontSize: number;
  readonly labelColor: number;
  /** Vertical gap between the label's bottom and the top of the
   *  circles. */
  readonly labelGapAbove: number;
  /** Synchronised horizontal jitter applied to the three combo
   *  circles when the chain breaks (movesRemaining 1 → 0 without
   *  an intervening clear). One shake per loss. */
  readonly lossShake: ShakeConfig;
}

/**
 * Decaying-sinusoid shake. `offset(t) = amplitude · (1 - t / duration) ·
 * sin(2π · frequencyHz · t)`. `amplitude` is in the shake target's
 * native units (screen px for HUD widgets, world units for World
 * objects).
 */
export interface ShakeConfig {
  readonly durationSeconds: number;
  readonly amplitude: number;
  readonly frequencyHz: number;
}

/**
 * Tray piece slide-in / slide-out animation. Entry fires whenever
 * a new tray item is added (initial deal, full-tray refill,
 * post-Tray-Refresh re-deal); exit fires only on Tray Refresh.
 *
 * Both animations stagger by tray column index so the leftmost slot
 * moves first. Pieces are non-interactable while their animation
 * is in flight (the pickup raycast skips animating items). World
 * units throughout; an `xOffset` of `~15` is comfortably outside
 * the camera's ortho extent for the default board.
 */
export interface TrayAnimationConfig {
  readonly entryDurationSeconds: number;
  readonly entryStaggerSeconds: number;
  /** Positive world-X displacement applied to each item at the start
   *  of its entry animation — items spawn off-screen-right and ease
   *  back to their slot position. */
  readonly entryStartXOffset: number;
  readonly exitDurationSeconds: number;
  readonly exitStaggerSeconds: number;
  /** Negative world-X displacement applied to each item at the end
   *  of its exit animation — items slide off-screen-left. */
  readonly exitEndXOffset: number;
}

/**
 * Trauma-style impact shake for the playing grid on line clear.
 * Each frame the grid is displaced by an *independent* random
 * offset on both axes (and optionally a small random rotation),
 * scaled by `amplitude · trauma^decayPower` where
 * `trauma = 1 - t/duration`. Quadratic decay (`decayPower = 2`)
 * is the canonical trauma shake — strong initial jolt that settles
 * quickly. Random-per-frame displacement (vs. a fixed-frequency
 * sinusoid) reads as a jolt, not a wobble.
 */
export interface GridShakeConfig {
  readonly durationSeconds: number;
  /** Base offset amplitude per axis, world units. The actual
   *  per-frame offset is uniform in `[-amp·decay, amp·decay]`. */
  readonly amplitude: number;
  /** Per-extra-line amplitude scale: total amplitude becomes
   *  `amplitude · (1 + amplitudeLineScale · (lineCount - 1))`. Set
   *  to `0` to disable scaling. */
  readonly amplitudeLineScale: number;
  /** Maximum random Y-axis rotation per frame (degrees), decayed
   *  by the same curve. `0` disables rotation jitter. */
  readonly rotationAmplitudeDegrees: number;
  /** Decay exponent on `(1 - t/duration)`. `1` is linear, `2` is
   *  the canonical trauma-shake quadratic, higher = sharper jolt. */
  readonly decayPower: number;
}

/**
 * Per-event score awards. Multiplied by the relevant count at the
 * call site (e.g. `placedBlock × footprint cells`,
 * `clearedLine × (fullRows + fullCols)`).
 */
export interface ScoreConfig {
  /** Per-cell award for a successful placement. */
  readonly placedBlock: number;
  /** Award per cleared row or column. Multi-line clears (e.g. a
   *  placement that finishes both a row and a column at once) award
   *  `clearedLine × line count`. */
  readonly clearedLine: number;
}

/**
 * Central tuning surface for the static layout, the piece catalog,
 * and the block colour palette.
 *
 * Grid dimensions, tray slot count, world-space cell sizes, spacing,
 * per-surface palettes, the piece catalog, the block colour palette,
 * and the per-block visual size all live here. Adding a new piece
 * type is a single entry in {@link pieceTypes}; adding or
 * recolouring a block colour is a single entry in {@link blockColors}.
 *
 * Piece colour is **not** a property of a piece type — every piece
 * type can render in any colour. The spawn layer picks a colour per
 * spawn (the initial tray deal picks K distinct colours from
 * {@link blockColors} so the slots always read as different).
 *
 * Default values are the canonical Block Blast / 1010! configuration:
 * 8×8 grid + 3-slot tray, with eight starter piece types and an
 * eight-colour block palette.
 */
export class BlockPuzzleConfig {
  // Grids are addressed by these stable ids. The cell view dispatches
  // its palette by mapping `gridId → BoardKind` via `boardKindFor`,
  // and `blockSizeFor` picks the per-block render size per surface.
  public readonly boardIds: BoardIds = {
    grid: 1,
    tray: 2,
  };

  // Playing grid — Standard is 9x9.
  public readonly gridColumns: number = 9;
  public readonly gridRows: number = 9;

  // Tray — K slots in a single row. Each slot holds one piece (one
  // `GameBoardItem`); the visual renders the piece's full shape
  // centred inside the slot. Three slots is the standard hand size.
  public readonly traySlots: number = 3;

  // World-space cell sizes. The playing grid uses one block per cell.
  // The tray slot is sized so the longest piece in the catalog (1×5
  // line) fits comfortably inside it (`5 × trayPieceCellSize <
  // traySlotSize`). The tray can be wider than the grid — the camera
  // ortho fit reads `max(grid.width, tray.width)` so both surfaces
  // stay on screen regardless.
  public readonly gridCellSize: number = 1;
  public readonly traySlotSize: number = 3.75;

  // Opacity tray pieces fade to when they have no valid placement
  // anywhere on the grid (per their current rotation). 0 hides them
  // entirely, 1 leaves them at full strength. The controller
  // recomputes per-piece placeability on every grid mutation and
  // pushes the result to the view.
  public readonly trayUnplaceableOpacity: number = 0.3;

  // World-space size of one block when rendered inside a tray slot.
  // Chosen so the longest piece in the catalog (1×5 line) fits inside
  // `traySlotSize` with margin: 5 × 0.6 = 3.0 ≤ 3.75. Tuning this
  // scales every piece's visual in the tray uniformly; pieces on
  // the playing grid render at `gridCellSize`.
  public readonly trayPieceCellSize: number = 0.6;

  // Vertical gap between the bottom of the playing grid and the top
  // of the tray, in world units.
  public readonly gridToTraySpacing: number = 1.5;

  // World-space margin reserved around the combined grid + tray
  // bounding box. The camera ortho size is recomputed on every resize
  // so the full content + margin fits regardless of aspect ratio.
  public readonly boardMargin: number = 1;

  // World-space distance from the top edge of the camera viewport to
  // the top edge of the playing grid. The grid is *top-anchored*:
  // its vertical position is recomputed on every resize so it stays
  // exactly this far below the screen top, regardless of remaining
  // space (which appears as extra room below the tray). Used by both
  // the world layout (grid + tray Z positions) and the HUD (combo
  // widget Y).
  public readonly gridTopMargin: number = 3.5;

  /**
   * Vertical-gradient background pairs for the game screen.
   * `default` paints during normal play; the boards controller
   * swaps to `selecting` while a target-selection booster is
   * pending and reverts on consume / cancel. Each pair becomes a
   * `CanvasTexture` set as `world.scene.background`.
   */
  public readonly backgroundColors: BackgroundColorsConfig = {
    default: { top: 0x9494d4, bottom: 0x3a3a7e },
    selecting: { top: 0x1a1a2a, bottom: 0x05050d },
  };

  /**
   * Playing-grid background + separator visuals. The view installs
   * both meshes (panel + backplate) under the playing grid's
   * `GridObject` the moment the grid is added. Padding is in world
   * units (matches `gridCellSize`).
   */
  public readonly gridBackgroundPanel: GridBackgroundPanelConfig = {
    padding: 0.25,
    cornerRadius: 0.45,
    panelColor: 0x3b3f8b,
    separatorColor: 0x4c50ad,
  };

  /**
   * Unit Block booster — temp 1-cell piece spawned in the tray
   * centre during Selecting. The boards view resolves the
   * absolute world position from the tray's geometric centre +
   * `trayPositionOffset`.
   */
  public readonly unitBlock: UnitBlockBoosterConfig = {
    trayPositionOffset: { x: 0, z: 0 },
  };

  /**
   * Hammer booster — destruction particle burst. Spawned by the
   * boards view at the destroyed cell's world position, tinted with
   * the destroyed block's colour.
   */
  public readonly hammerParticles: HammerParticlesConfig = {
    count: 14,
    size: 0.16,
    spawnSpeedMin: 1.5,
    spawnSpeedMax: 3.5,
    gravity: 7.0,
    lifetime: 0.7,
  };

  /**
   * Unit Block booster — sparkle / radiance particles around the
   * temp 1-cell piece while it's idle in the tray. See
   * {@link UnitBlockSparklesConfig}.
   */
  public readonly unitBlockSparkles: UnitBlockSparklesConfig = {
    rate: 22,
    maxParticles: 48,
    lifetimeSeconds: 0.9,
    emitRadius: 0.55,
    starOuterRadius: 0.14,
    starInnerRadius: 0.06,
    driftSpeed: 0.5,
    color: 0xffffff,
  };

  /**
   * Hammer booster — grid wobble during Selecting. The boards
   * controller drives a time accumulator while Hammer is the
   * pending booster; the view applies `sin`-based rotation per
   * grid block with a per-block random phase.
   */
  public readonly hammerWobble: HammerWobbleConfig = {
    amplitudeDegrees: 3,
    frequencyHz: 4,
    phaseRandomnessRange: Math.PI * 2,
  };

  // `Grid.cellOutline` is bound to the separator colour on purpose
  // — the per-cell outline line shouldn't read as a competing
  // colour against the separator backplate, so the two stay in
  // sync from this single source.
  public readonly palettes: Readonly<Record<BoardKind, BoardPalette>> = {
    [BoardKind.Grid]: {
      cellFill: 0x1f2a44,
      cellOutline: this.gridBackgroundPanel.separatorColor,
    },
    [BoardKind.Tray]: {
      cellFill: 0x2a1f44,
      cellOutline: 0x6b3b8a,
      drawBackground: false,
    },
  };

  /**
   * The full piece catalog. Each entry is a self-contained shape
   * definition — colour is decoupled (see {@link blockColors}) and
   * so is rotation (see {@link rotatedShapes}). Adding a new piece
   * is one new entry here; the rotation pool is computed
   * automatically at config-load.
   */
  public readonly pieceTypes: readonly PieceType[] = [
    { name: "smallL", cells: [[0, 0], [0, 1], [1, 1]] },
    { name: "mediumL", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    { name: "largeL", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] },
    { name: "square2", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    {
      name: "square3",
      cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
    },
    { name: "line3", cells: [[0, 0], [1, 0], [2, 0]] },
    { name: "line4", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { name: "line5", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  ];

  /**
   * Block colour palette. The spawn picker chooses K distinct
   * colours from this list for the K tray slots, so the player
   * always sees three different colours at once. Must contain at
   * least {@link traySlots} entries.
   *
   * Adding or recolouring a colour is one entry here — no piece
   * definition or rendering code touches the palette.
   */
  public readonly blockColors: readonly number[] = [
    0xff1a31, 0xff9944, 0xffe01b, 0x53e553, 0x31dbdb, 0x9966ff, 0xff66cc,
  ];

  /**
   * Per-piece-type pool of unique rotated shapes. Computed once at
   * config-load by {@link PieceRotationCalculator.computeAll}; the
   * spawner picks a piece type uniformly from {@link pieceTypes},
   * then a rotation uniformly from this pool, so symmetric shapes
   * (squares, lines) don't over-represent their rotations.
   */
  public readonly rotatedShapes: ReadonlyMap<PieceType, readonly PieceCells[]>;

  public constructor() {
    this.rotatedShapes = PieceRotationCalculator.computeAll(this.pieceTypes);
  }

  /**
   * Drag-pipeline visual tuning. Anchor offsets live here so the
   * view stays render-only; tweaking ghost translucency / lifted
   * piece height is a config edit, not a view change.
   */
  public readonly drag: DragConfig = {
    liftedY: 0.6,
    // Must stay above `PieceMeshBuilder.DEFAULT_BLOCK_Y` (0.05) so
    // the predictive line-clear highlight reads on top of already-
    // placed pieces in the clearing row / column.
    ghostY: 0.06,
    ghostOpacity: 0.6,
    pickupLift: 1.5,
    pointerAreaMargin: 0.5,
    clearPreviewOutline: {
      color: 0xffffff,
      thickness: 0.08,
      haloColor: 0xffffff,
      haloAlpha: 0.35,
      haloPadding: 0.1,
    },
  };

  /**
   * Time-display tuning. Same field shape as Solitaire's
   * `SolitaireConfig.time` — `TimerModel` accumulates elapsed
   * seconds while the game is Playing; `TimeFormatter` applies the
   * direction + format to produce the rendered string.
   *
   * Default: count down from 4:00. When the displayed value hits
   * zero while in Playing, the HUD controller transitions to
   * {@link GameState.TimeUp} — an independent terminal state from
   * {@link GameState.GameOver}, with its own "TIME UP!" overlay
   * and the booster ready-label suppressed.
   */
  public readonly time: TimeConfig = {
    startSeconds: 240,
    direction: "down",
    displayFormat: "mm:ss",
  };

  /**
   * Score awards. `placedBlock` multiplies by the placed piece's
   * footprint cell count; `clearedLine` multiplies by the number
   * of full rows + columns cleared by the placement (so a single
   * placement that completes both a row and a column awards
   * `2 × clearedLine`).
   */
  public readonly score: ScoreConfig = {
    placedBlock: 10,
    clearedLine: 100,
  };

  /**
   * Booster panel + progress-bar visuals. `BoosterPanelModel` reads
   * `stagesPerCharge`; the HUD view reads everything else.
   */
  public readonly booster: BoosterPanelConfig = {
    stagesPerCharge: 3,
    bottomMargin: 24,
    buttonSize: 56,
    buttonSpacing: 20,
    buttonActiveAlpha: 1,
    buttonInactiveAlpha: 0.35,
    buttonLabelFontSize: 14,
    buttonLabelColor: 0xffffff,
    buttons: {
      [BoosterType.Hammer]: { color: 0xff6644, label: "HAMMER" },
      [BoosterType.UnitBlock]: { color: 0x44aaff, label: "UNIT" },
      [BoosterType.TrayRefresh]: { color: 0x66cc66, label: "REFRESH" },
    },
    progressGapAbove: 10,
    progressWidth: 220,
    progressHeight: 8,
    progressFillColor: 0x66cc66,
    progressTrackColor: 0x333333,
    readyLabelChooseOne: "CHOOSE ONE!",
    readyLabelNoMoves: "NO MOVES LEFT, USE BOOSTER!",
    readyLabelFontSize: 14,
    readyLabelColor: 0xffffff,
    panelBackgroundColor: 0x1a1a1a,
    panelPadding: 12,
    panelCornerRadius: 16,
    selectedScale: 1.2,
    cancel: {
      size: 24,
      backgroundColor: 0x333333,
      iconColor: 0xffffff,
      offsetX: 24,
      offsetY: -24,
    },
    selectingPromptHammer: "Destroy a block",
    selectingPromptUnitBlock: "Use a single block",
  };

  /**
   * Combo widget visuals + the streak's max-moves budget. `ComboModel`
   * reads `maxMoves`; the HUD view reads everything else.
   */
  public readonly combo: ComboConfig = {
    maxMoves: 3,
    circleRadius: 14,
    circleSpacing: 12,
    circleColorActive: 0x66cc66,
    circleColorInactive: 0x555555,
    labelBiasRatio: 0.4,
    circlesBiasRatio: 0.75,
    referencePxPerWorld: 40,
    labelFontSize: 20,
    labelColor: 0xffffff,
    labelGapAbove: 8,
    lossShake: {
      durationSeconds: 0.35,
      amplitude: 6,
      frequencyHz: 22,
    },
  };

  /**
   * Trauma-style impact shake on line clear. Per-axis random
   * displacement + optional rotation jitter every frame, amplitude
   * decays as `(1 - t/duration)^decayPower`. Amplitude scales with
   * the placement's line count via `amplitudeLineScale`.
   */
  public readonly gridShake: GridShakeConfig = {
    durationSeconds: 0.32,
    amplitude: 0.12,
    amplitudeLineScale: 0.6,
    rotationAmplitudeDegrees: 1.5,
    decayPower: 1.7,
  };

  /**
   * Tray piece entry / exit slide animation. Entry fires for every
   * tray add (initial, refill, post-refresh); exit fires only when
   * Tray Refresh is used.
   */
  public readonly trayAnimation: TrayAnimationConfig = {
    entryDurationSeconds: 0.32,
    entryStaggerSeconds: 0.08,
    entryStartXOffset: 15,
    exitDurationSeconds: 0.26,
    exitStaggerSeconds: 0.07,
    exitEndXOffset: -15,
  };

  public readonly transitions: { readonly gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };

  /**
   * Resolve which surface a grid id belongs to. The cell view uses
   * this to pick its palette without needing to know about either
   * grid's columnSize or rowCount — only its id.
   */
  public boardKindFor(gridId: number): BoardKind {
    if (gridId === this.boardIds.grid) return BoardKind.Grid;
    if (gridId === this.boardIds.tray) return BoardKind.Tray;
    throw new Error(`BlockPuzzleConfig: unknown grid id ${gridId}`);
  }

  /**
   * Per-block visual size for items rendered on the given grid.
   * Tray pieces render small enough that the largest shape fits in
   * a slot; pieces placed on the playing grid (later steps) render
   * at `gridCellSize` so they line up with the underlying cells.
   */
  public blockSizeFor(gridId: number): number {
    return gridId === this.boardIds.tray ? this.trayPieceCellSize : this.gridCellSize;
  }
}
