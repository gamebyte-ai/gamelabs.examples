import * as THREE from "three";
import {
  GridsView,
  ParticleBudget,
  World,
  type AddGridData,
  type GridCoord,
  type GridItemObjectOptions,
  type IInstanceResolver,
  type IParticleEmitter,
  type IPointerInputHandler,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { BlockPuzzleConfig, type PieceCells } from "../../../BlockPuzzleConfig";
import { GameBoardItem } from "../models/GameBoardItem";
import { GameBoardCellObject } from "./GameBoardCellObject";
import { GameBoardItemObject } from "./GameBoardItemObject";
import { HammerParticleEmitter } from "./HammerParticleEmitter";
import { PieceMeshBuilder } from "./PieceMeshBuilder";
import { UnitBlockSparkleEmitter } from "./UnitBlockSparkleEmitter";
import type {
  ClearPreviewProvider,
  IGameBoardsView,
  PiecePlacementInfo,
  PiecePlacementPredicate,
  TrayPlaceability,
} from "./IGameBoardsView";

/**
 * Source-specific bookkeeping for an in-flight drag. The two source
 * shapes share the common drag fields ({@link DragSession}) and
 * differ only in (a) the model item the drop maps back to, and (b)
 * the visual that gets hidden during the drag and restored on
 * cancel.
 */
type DragSourceTray = {
  readonly kind: "tray";
  readonly trayCol: number;
  readonly item: GameBoardItem;
  /** Reference to the tray cell's visual. Hidden during the drag,
   *  restored on cancel; on success the controller's commit fires
   *  `onItemRemoved` which destroys it. */
  readonly hiddenCellItem: GameBoardItemObject;
};

type DragSourceUnitBlock = {
  readonly kind: "unitBlock";
  /** Temp 1-cell visual built by `enterUnitBlockMode`. Hidden during
   *  the drag; restored on cancel; destroyed (along with the rest of
   *  Unit Block mode) when the booster is consumed. */
  readonly hiddenGroup: THREE.Group;
};

/**
 * In-flight tray slide animation. Both entry and exit move the
 * item along the local X axis; positions are in the item's
 * cell-local space (which is offset by an unchanging amount per
 * cell, so adding to the cell's natural X gives the visible slide).
 */
interface TrayAnimState {
  readonly startX: number;
  readonly targetX: number;
  readonly duration: number;
  readonly delay: number;
  elapsed: number;
}

interface DragSession {
  readonly source: DragSourceTray | DragSourceUnitBlock;
  /** Rendered shape for this drag (the rotation the spawner picked
   *  for tray pieces; `[[0, 0]]` for Unit Block). All bbox math +
   *  footprint computation reads from here. */
  readonly cells: PieceCells;
  readonly color: number;
  readonly pointerId: number;
  readonly liftedGroup: THREE.Group;
  /** World-space delta from the pointer's ground projection to the
   *  piece's top-left cell (cell (0, 0)) at the moment of grab.
   *  During drag, `pieceTopLeftCellWorld = pointer + pickupOffset` —
   *  this keeps the relative grip the player started with regardless
   *  of how the piece scales between tray and grid sizes. */
  readonly pickupOffset: { readonly x: number; readonly z: number };
}

/**
 * World view for the boards (playing grid + tray) with drag-driven
 * piece placement layered on top of the framework's auto-sync.
 *
 * The lifted piece and the ghost preview are deliberately decoupled:
 *
 * - **Lifted piece** always free-tracks the pointer with the captured
 *   `pickupOffset`. It never snaps to the grid and can hang off the
 *   board edge — what the player sees under their finger is exactly
 *   where they grabbed the piece.
 * - **Ghost preview** uses the **pointer-area gate + clamp-into-
 *   bounds anchor**: when the pointer is inside the grid bbox plus
 *   `drag.pointerAreaMargin` cells, the raw target is computed from
 *   the piece's top-left (round-to-nearest) and then clamped to
 *   `[0, gridCols - pieceCols]` / `[0, gridRows - pieceRows]` so the
 *   whole footprint fits in bounds. After the clamp, validity is
 *   pure occupancy — the clamp gives the ghost a magnetic-to-edges
 *   feel (large pieces stick to the nearest valid corner regardless
 *   of which part of the piece was grabbed).
 *
 * Drop:
 * - Ghost visible (pointer in area + cells empty) → commit at the
 *   clamped anchor.
 * - Otherwise → snap the piece back to its tray slot.
 *
 * Pipeline on pointer-down:
 * 1. Raycast against every visible tray piece's blocks.
 * 2. If a piece is hit, hide its cell-item visual and build a
 *    lifted visual at grid scale inside the drag root.
 * 3. Capture `pickupOffset = topLeftCellWorld - pointerWorld` for
 *    free-tracking throughout the drag.
 *
 * Pipeline on pointer-move / pointer-up:
 * 1. Lifted piece position = pointer + pickupOffset (always free).
 * 2. Ghost target = {@link _computeAnchorAt}(ground); the ghost
 *    renders only when the predicate accepts the clamped footprint.
 * 3. On pointer-up: clamped anchor + accepting predicate → emit
 *    `onPiecePlacement`; otherwise → snap back to tray.
 */
export class GameBoardsView extends GridsView implements IGameBoardsView, IPointerInputHandler {
  private _world: World | null = null;
  private _config: BlockPuzzleConfig | null = null;
  private _particleBudget: ParticleBudget | null = null;
  private _hammerEmitter: HammerParticleEmitter | null = null;
  private _unitBlockSparkleEmitter: UnitBlockSparkleEmitter | null = null;

  private _dragRoot: THREE.Group | null = null;
  private _ghostRoot: THREE.Group | null = null;

  private _dragSession: DragSession | null = null;
  private _validityPredicate: PiecePlacementPredicate | null = null;
  private _clearPreviewProvider: ClearPreviewProvider | null = null;
  private _dragEnabled = true;
  private _cellTapEnabled = false;
  /** Last placeability map the controller pushed. Drag-start reads
   *  it to decide whether the lifted piece visual should render
   *  faded — matching the piece's tray-slot appearance. */
  private _trayPlaceability: TrayPlaceability | null = null;
  /** Pending cell-tap state captured on pointer-down while
   *  `_cellTapEnabled`. Cleared on pointer-up or pointer-cancel. */
  private _pendingCellTap: {
    readonly col: number;
    readonly row: number;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
  } | null = null;

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _groundHit = new THREE.Vector3();
  private readonly _scratchVec = new THREE.Vector3();

  private readonly _placementListeners = new Set<(info: PiecePlacementInfo) => void>();
  private readonly _cellTapListeners = new Set<(col: number, row: number) => void>();
  private readonly _unitBlockPlacementListeners = new Set<(footprint: readonly GridCoord[]) => void>();
  /** Active Unit Block mode visual + state. The group sits as a
   *  direct child of the boards view at its home position; drag
   *  hides it, drop replaces it (via consume on the booster) or
   *  cancel restores it. */
  private _unitBlockGroup: THREE.Group | null = null;
  private _unitBlockColor = 0xffffff;
  private _unitBlockPlaceable = true;
  /** Playing grid's base position + rotation captured at `addGrid`
   *  — the shake transform is applied relative to these. `null`
   *  until the playing grid is added. */
  private _playingGridBaseTransform: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly rotY: number;
  } | null = null;
  /** Tray entry / exit animation state. Each map is keyed by the
   *  animating item visual so the pickup raycast can short-circuit
   *  on membership without iterating. */
  private readonly _trayEntryAnimations = new Map<GameBoardItemObject, TrayAnimState>();
  private readonly _trayExitAnimations = new Map<GameBoardItemObject, TrayAnimState>();
  /** Fired once after the *last* in-flight exit animation finishes —
   *  the caller (boards controller) clears the model items and deals
   *  a new hand inside this callback. Set by `beginTrayExit`,
   *  cleared on fire. */
  private _trayExitDoneCallback: (() => void) | null = null;
  /** Cache of gradient textures keyed by `${topHex}|${bottomHex}`.
   *  Two entries are typical (default + selecting); they live for
   *  the view's lifetime and are disposed in `preDestroy`. */
  private readonly _gradientTextureCache = new Map<string, THREE.Texture>();
  /** Pointer-up + pointer-down must be within this many CSS pixels
   *  of each other (and on the same cell) for a grid tap to fire.
   *  Hardcoded — booster cell-tap is a discrete action, not tuned
   *  per device. */
  private static readonly CELL_TAP_THRESHOLD_PX = 8;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._world = resolver.getInstance(World);
    this._config = resolver.getInstance(BlockPuzzleConfig);
    this._particleBudget = resolver.getInstance(ParticleBudget);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._dragRoot = new THREE.Group();
    this._dragRoot.name = "BlockPuzzle.DragRoot";
    this._dragRoot.visible = false;
    this.add(this._dragRoot);

    this._ghostRoot = new THREE.Group();
    this._ghostRoot.name = "BlockPuzzle.GhostRoot";
    this._ghostRoot.visible = false;
    this.add(this._ghostRoot);

    // Build the Hammer destruction emitter. It lives at the view's
    // origin (no parent grid offset) and operates in world-space
    // coordinates — `emitHammerBurst` resolves the destroyed cell's
    // world position before forwarding to `burst()`.
    if (this._particleBudget !== null && this._config !== null) {
      this._hammerEmitter = new HammerParticleEmitter(this._particleBudget, this._config);
      this._hammerEmitter.name = "BlockPuzzle.HammerEmitter";
      this.add(this._hammerEmitter);

      this._unitBlockSparkleEmitter = new UnitBlockSparkleEmitter(this._particleBudget, this._config);
      this._unitBlockSparkleEmitter.name = "BlockPuzzle.UnitBlockSparkleEmitter";
      this.add(this._unitBlockSparkleEmitter);
    }
  }

  public setPlacementPredicate(predicate: PiecePlacementPredicate | null): void {
    this._validityPredicate = predicate;
  }

  public setClearPreviewProvider(provider: ClearPreviewProvider | null): void {
    this._clearPreviewProvider = provider;
  }

  public setDragEnabled(enabled: boolean): void {
    this._dragEnabled = enabled;
    // Going off mid-drag (e.g. countdown hit zero while the player
    // was dragging) — abort the current session as if the drop were
    // invalid so the tray-piece visual snaps back / the unit-block
    // visual reappears.
    if (!enabled && this._dragSession !== null) {
      this._endDragSession(true);
    }
  }

  public setCellTapEnabled(enabled: boolean): void {
    this._cellTapEnabled = enabled;
    if (!enabled) this._pendingCellTap = null;
  }

  public setTrayPlaceability(perSlot: TrayPlaceability | null): void {
    this._trayPlaceability = perSlot;
    if (this._config === null) return;
    const trayObj = this.getGridObject(this._config.boardIds.tray);
    if (!trayObj) return;
    const fadedOpacity = this._config.trayUnplaceableOpacity;
    for (let col = 0; col < trayObj.columnCount; col++) {
      const cell = trayObj.getCell(col, 0);
      if (!(cell?.item instanceof GameBoardItemObject)) continue;
      const placeable = perSlot === null ? true : (perSlot.get(col) ?? true);
      cell.item.setFaded(!placeable, fadedOpacity);
    }
  }

  public onPiecePlacement(callback: (info: PiecePlacementInfo) => void): Unsubscribe {
    this._placementListeners.add(callback);
    return () => {
      this._placementListeners.delete(callback);
    };
  }

  public onGridCellTapped(callback: (col: number, row: number) => void): Unsubscribe {
    this._cellTapListeners.add(callback);
    return () => {
      this._cellTapListeners.delete(callback);
    };
  }

  public setBackgroundGradient(top: number, bottom: number): void {
    if (!this._world) return;
    const tex = this._getOrCreateGradientTexture(top, bottom);
    this._world.scene.background = tex;
    // Clear colour fallback for the brief frame between scene
    // assignment and the next render — pick the bottom stop so any
    // edge sampling reads as the gradient's lower band.
    this._world.renderer.setClearColor(bottom, 1);
  }

  private _getOrCreateGradientTexture(top: number, bottom: number): THREE.Texture {
    const key = `${top.toString(16)}|${bottom.toString(16)}`;
    const cached = this._gradientTextureCache.get(key);
    if (cached !== undefined) return cached;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("GameBoardsView: failed to acquire 2D canvas context for gradient");
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, GameBoardsView._cssHex(top));
    grad.addColorStop(1, GameBoardsView._cssHex(bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this._gradientTextureCache.set(key, tex);
    return tex;
  }

  private static _cssHex(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  public get hammerEmitter(): IParticleEmitter {
    if (!this._hammerEmitter) {
      throw new Error("GameBoardsView: hammerEmitter accessed before postInitialize");
    }
    return this._hammerEmitter;
  }

  public get unitBlockSparkleEmitter(): IParticleEmitter {
    if (!this._unitBlockSparkleEmitter) {
      throw new Error("GameBoardsView: unitBlockSparkleEmitter accessed before postInitialize");
    }
    return this._unitBlockSparkleEmitter;
  }

  /**
   * Resolve the destroyed cell's world position and fire the emitter
   * once at that point with `color`. The position is taken from the
   * cell's visual object (its world matrix is up-to-date because the
   * grid's transform is stable for the lifetime of the view).
   */
  public emitHammerBurst(col: number, row: number, color: number): void {
    if (!this._hammerEmitter || !this._config) return;
    const gridObj = this.getGridObject(this._config.boardIds.grid);
    if (!gridObj) return;
    const cellObj = gridObj.getCell(col, row);
    if (!cellObj) return;
    cellObj.updateWorldMatrix(true, false);
    const worldPos = cellObj.getWorldPosition(GameBoardsView._scratchWorldPos);
    this._hammerEmitter.burst(worldPos.x, worldPos.z, color);
  }

  /**
   * Apply / clear the Hammer wobble on every block in the playing
   * grid. `time === null` snaps blocks back to zero rotation (called
   * on Selecting exit). Otherwise computes
   * `rotation.y = amp · sin(2π · f · t + phase)` per block, sampling
   * `phase` lazily on first touch and stashing it on the block's
   * `userData` so it persists across frames.
   */
  public setHammerWobble(time: number | null): void {
    if (!this._config) return;
    const gridObj = this.getGridObject(this._config.boardIds.grid);
    if (!gridObj) return;
    const cfg = this._config.hammerWobble;
    const ampRad = (cfg.amplitudeDegrees * Math.PI) / 180;
    const omega = 2 * Math.PI * cfg.frequencyHz;
    for (let col = 0; col < gridObj.columnCount; col++) {
      for (let row = 0; row < gridObj.rowCount; row++) {
        const cell = gridObj.getCell(col, row);
        const item = cell?.item;
        if (!(item instanceof GameBoardItemObject)) continue;
        if (time === null) {
          item.rotation.y = 0;
          continue;
        }
        let phase = item.userData["wobblePhase"] as number | undefined;
        if (phase === undefined) {
          phase = Math.random() * cfg.phaseRandomnessRange;
          item.userData["wobblePhase"] = phase;
        }
        item.rotation.y = ampRad * Math.sin(omega * time + phase);
      }
    }
  }

  public enterUnitBlockMode(color: number, worldX: number, worldZ: number): void {
    if (!this._config) return;
    // Re-entry: reposition the existing group + restore state.
    if (this._unitBlockGroup !== null) {
      this._unitBlockGroup.position.set(worldX, 0, worldZ);
      this._unitBlockGroup.visible = true;
      this._unitBlockColor = color;
      this._setUnitBlockSparkleEmissionAt(worldX, worldZ, true);
      return;
    }
    this._setTrayVisualsVisible(false);

    const group = new THREE.Group();
    group.name = "BlockPuzzle.UnitBlock";
    group.position.set(worldX, 0, worldZ);
    PieceMeshBuilder.appendBlocks(group, [[0, 0]], this._config.trayPieceCellSize, color, {
      opacity: 1,
    });
    this.add(group);
    this._unitBlockGroup = group;
    this._unitBlockColor = color;
    this._unitBlockPlaceable = true;
    this._setUnitBlockSparkleEmissionAt(worldX, worldZ, true);
  }

  public exitUnitBlockMode(): void {
    // Sparkle emission off before the group is gone — in-flight
    // particles finish their fade naturally.
    this._setUnitBlockSparkleEmissionAt(0, 0, false);
    // Cancel any in-flight Unit Block drag — its `hiddenGroup` is
    // about to be disposed, so finishing the drag normally would
    // either flash the (about-to-be-discarded) group or leave dead
    // state. Force an invalid teardown that doesn't try to restore
    // the soon-gone group.
    if (this._dragSession !== null && this._dragSession.source.kind === "unitBlock") {
      this._endDragSession(false);
    }
    if (this._unitBlockGroup !== null) {
      this.remove(this._unitBlockGroup);
      GameBoardsView._disposeGroupChildren(this._unitBlockGroup);
      this._unitBlockGroup = null;
    }
    this._unitBlockPlaceable = true;
    this._setTrayVisualsVisible(true);
  }

  public setUnitBlockPlaceable(placeable: boolean): void {
    if (!this._unitBlockGroup || !this._config) return;
    this._unitBlockPlaceable = placeable;
    const opacity = placeable ? 1 : this._config.trayUnplaceableOpacity;
    this._unitBlockGroup.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.transparent = opacity < 1;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    });
  }

  public onUnitBlockPlacement(callback: (footprint: readonly GridCoord[]) => void): Unsubscribe {
    this._unitBlockPlacementListeners.add(callback);
    return () => {
      this._unitBlockPlacementListeners.delete(callback);
    };
  }

  /**
   * Toggle the Unit Block sparkle stream. When enabling, reposition
   * the emission centre at the temp piece's current idle world
   * position; particles already alive keep their trajectories so
   * the transition reads as continuous rather than a hard stop.
   */
  private _setUnitBlockSparkleEmissionAt(x: number, z: number, enabled: boolean): void {
    if (this._unitBlockSparkleEmitter === null || this._config === null) return;
    if (enabled) {
      this._unitBlockSparkleEmitter.setSpawnCenter(x, z);
      this._unitBlockSparkleEmitter.setRate(this._config.unitBlockSparkles.rate);
    } else {
      this._unitBlockSparkleEmitter.setRate(0);
    }
  }

  public setGridShakeTransform(offsetX: number, offsetZ: number, rotationY: number): void {
    if (!this._config || this._playingGridBaseTransform === null) return;
    const gridObj = this.getGridObject(this._config.boardIds.grid);
    if (!gridObj) return;
    const base = this._playingGridBaseTransform;
    gridObj.position.set(base.x + offsetX, base.y, base.z + offsetZ);
    gridObj.rotation.y = base.rotY + rotationY;
  }

  /**
   * Raycast against the Unit Block temp piece's block meshes. The
   * group includes one mesh per cell (just one for the 1-cell unit
   * block); we return `true` on any hit so the caller can start a
   * drag session.
   */
  private _pickUnitBlock(event: PointerEvent): boolean {
    if (!this._unitBlockGroup || !this._world) return false;
    const rect = this._world.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const meshes: THREE.Object3D[] = [];
    this._unitBlockGroup.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) meshes.push(node);
    });
    if (meshes.length === 0) return false;
    return this._raycaster.intersectObjects(meshes, false).length > 0;
  }

  /**
   * Mirror of `_beginDragSession` for the Unit Block temp piece.
   * Reuses the same lifted/ghost pipeline; difference is the source
   * shape (no tray cell, no model item) and a synthesised pickup
   * offset since the unit block isn't anchored to a tray slot.
   */
  private _beginUnitBlockDragSession(event: PointerEvent): void {
    if (!this._config || !this._dragRoot || !this._unitBlockGroup) return;
    const ground = this._projectPointerToGround(event);
    if (ground === null) return;

    const cells: PieceCells = [[0, 0]];
    const gridBlockSize = this._config.gridCellSize;
    // bbox is 1x1; pickup offset X = 0; Z = (centerZ) - ground.z - lift.
    const pickupOffsetX = 0;
    const centerZ = this._unitBlockGroup.position.z;
    const pickupOffsetZ = centerZ - ground.z - this._config.drag.pickupLift;

    this._unitBlockGroup.visible = false;
    // Sparkles only emit while the piece is idle — turn the stream
    // off for the duration of the drag. In-flight particles finish
    // their fade naturally.
    this._setUnitBlockSparkleEmissionAt(0, 0, false);
    const liftedOpacity = this._unitBlockPlaceable ? 1 : this._config.trayUnplaceableOpacity;

    const liftedGroup = new THREE.Group();
    PieceMeshBuilder.appendBlocks(liftedGroup, cells, gridBlockSize, this._unitBlockColor, {
      opacity: liftedOpacity,
      y: 0,
    });
    this._dragRoot.add(liftedGroup);
    this._dragRoot.visible = true;

    this._dragSession = {
      source: { kind: "unitBlock", hiddenGroup: this._unitBlockGroup },
      cells,
      color: this._unitBlockColor,
      pointerId: event.pointerId,
      liftedGroup,
      pickupOffset: { x: pickupOffsetX, z: pickupOffsetZ },
    };

    this._updateLiftedAt(this._dragSession, ground);
    this._updateGhostAt(this._dragSession, this._computeAnchorAt(this._dragSession, ground));
  }

  /** Toggle every tray-piece visual's `visible` flag — used by the
   *  Unit Block mode enter/exit to hide / restore the 3 tray pieces. */
  private _setTrayVisualsVisible(visible: boolean): void {
    if (!this._config) return;
    const trayObj = this.getGridObject(this._config.boardIds.tray);
    if (!trayObj) return;
    for (let col = 0; col < trayObj.columnCount; col++) {
      const item = trayObj.getCell(col, 0)?.item;
      if (item instanceof GameBoardItemObject) item.visible = visible;
    }
  }

  private static readonly _scratchWorldPos = new THREE.Vector3();

  /**
   * Overrides the framework's grid-creation path so the playing
   * grid gets a background frame attached as soon as its
   * `GridObject` exists. The tray grid takes the default path with
   * no frame.
   */
  public override addGrid(data: AddGridData): void {
    super.addGrid(data);
    if (this._config !== null && data.id === this._config.boardIds.grid) {
      this._installPlayingGridBackground(data.id);
      this._playingGridBaseTransform = {
        x: data.position.x,
        y: data.position.y,
        z: data.position.z,
        rotY: data.rotation.y,
      };
    }
  }

  /**
   * Refresh the playing grid's cached shake base whenever the model
   * pushes a new position (the App's `_applyLayout` does this on
   * every resize since the grid is top-anchored). Without this, the
   * shake offsets and the eventual snap-back would land on the
   * initial-deal base captured in `addGrid`, leaving the grid stuck
   * at the old layout position.
   *
   * Shake itself bypasses this path — it writes to `gridObj.position`
   * directly, so the offset never leaks into the cached base.
   */
  public override updateGridPosition(gridId: number, position: { x: number; y: number; z: number }): void {
    super.updateGridPosition(gridId, position);
    if (this._config !== null && gridId === this._config.boardIds.grid && this._playingGridBaseTransform !== null) {
      this._playingGridBaseTransform = {
        x: position.x,
        y: position.y,
        z: position.z,
        rotY: this._playingGridBaseTransform.rotY,
      };
    }
  }

  /**
   * Wrap the framework's item creation: every tray-cell add (initial
   * deal, refill, post-refresh) kicks off the entry slide-in. The
   * super call positions the item at the cell's rest position, then
   * we shift it off-screen-right and stash that as the starting X
   * for the per-frame interpolator.
   */
  public override createItem(itemOptions: GridItemObjectOptions, gridId: number, col: number, row: number): void {
    super.createItem(itemOptions, gridId, col, row);
    if (this._config === null) return;
    if (gridId !== this._config.boardIds.tray) return;
    const gridObj = this.getGridObject(gridId);
    if (!gridObj) return;
    const item = gridObj.getCell(col, row)?.item;
    if (!(item instanceof GameBoardItemObject)) return;
    const cfg = this._config.trayAnimation;
    const targetX = item.position.x;
    const startX = targetX + cfg.entryStartXOffset;
    item.position.x = startX;
    this._trayEntryAnimations.set(item, {
      startX,
      targetX,
      duration: cfg.entryDurationSeconds,
      delay: col * cfg.entryStaggerSeconds,
      elapsed: 0,
    });
  }

  /**
   * Clean up any in-flight animation entries for the item being
   * removed — happens on regular drag-drop placement (tray slot
   * empties), full-tray clears, and the post-exit refresh clear.
   */
  public override destroyItem(itemId: number, gridId: number, col: number, row: number): void {
    const gridObj = this.getGridObject(gridId);
    const item = gridObj?.getCell(col, row)?.item;
    if (item instanceof GameBoardItemObject) {
      this._trayEntryAnimations.delete(item);
      this._trayExitAnimations.delete(item);
    }
    super.destroyItem(itemId, gridId, col, row);
  }

  public beginTrayExit(onComplete: () => void): void {
    if (this._config === null) {
      onComplete();
      return;
    }
    const cfg = this._config.trayAnimation;
    const tray = this.getGridObject(this._config.boardIds.tray);
    if (!tray) {
      onComplete();
      return;
    }
    // Cancel any in-flight entry — items teleport to their rest
    // position before the exit slide starts so the two animations
    // don't fight for the same X.
    for (const [item, anim] of this._trayEntryAnimations) {
      item.position.x = anim.targetX;
    }
    this._trayEntryAnimations.clear();

    let any = false;
    for (let col = 0; col < tray.columnCount; col++) {
      const item = tray.getCell(col, 0)?.item;
      if (!(item instanceof GameBoardItemObject)) continue;
      const startX = item.position.x;
      this._trayExitAnimations.set(item, {
        startX,
        targetX: startX + cfg.exitEndXOffset,
        duration: cfg.exitDurationSeconds,
        delay: col * cfg.exitStaggerSeconds,
        elapsed: 0,
      });
      any = true;
    }
    if (!any) {
      onComplete();
      return;
    }
    this._trayExitDoneCallback = onComplete;
  }

  public tickTrayAnimations(dt: number): void {
    if (this._trayEntryAnimations.size > 0) {
      for (const [item, anim] of this._trayEntryAnimations) {
        anim.elapsed += dt;
        if (anim.elapsed < anim.delay) {
          item.position.x = anim.startX;
          continue;
        }
        const t = Math.min(1, (anim.elapsed - anim.delay) / anim.duration);
        const eased = GameBoardsView._easeOutCubic(t);
        item.position.x = anim.startX + (anim.targetX - anim.startX) * eased;
        if (t >= 1) {
          item.position.x = anim.targetX;
          this._trayEntryAnimations.delete(item);
        }
      }
    }
    if (this._trayExitAnimations.size > 0) {
      for (const [item, anim] of this._trayExitAnimations) {
        anim.elapsed += dt;
        if (anim.elapsed < anim.delay) continue;
        const t = Math.min(1, (anim.elapsed - anim.delay) / anim.duration);
        const eased = GameBoardsView._easeInCubic(t);
        item.position.x = anim.startX + (anim.targetX - anim.startX) * eased;
        if (t >= 1) {
          item.position.x = anim.targetX;
          this._trayExitAnimations.delete(item);
        }
      }
      if (this._trayExitAnimations.size === 0 && this._trayExitDoneCallback !== null) {
        const cb = this._trayExitDoneCallback;
        this._trayExitDoneCallback = null;
        cb();
      }
    }
  }

  private static _easeOutCubic(t: number): number {
    const u = 1 - t;
    return 1 - u * u * u;
  }

  private static _easeInCubic(t: number): number {
    return t * t * t;
  }

  /**
   * Build the playing grid's background: a rounded-corner outer
   * panel (`gridBackgroundPanel.panelColor`) sized `padding` world
   * units larger than the cell area, plus an inner backplate
   * (`separatorColor`) sized exactly to the cell area. Both are
   * children of the `GridObject` so they translate with it and get
   * disposed alongside it.
   *
   * Y layering keeps both meshes below the cell fill at 0.005 so
   * the cells render on top, with their 8% inset gap revealing the
   * separator backplate.
   */
  private _installPlayingGridBackground(gridId: number): void {
    if (!this._config) return;
    const gridObj = this.getGridObject(gridId);
    if (!gridObj) return;

    const cfg = this._config.gridBackgroundPanel;
    const cw = this._config.gridCellSize;
    const cols = this._config.gridColumns;
    const rows = this._config.gridRows;

    const gridW = cols * cw;
    const gridD = rows * cw;
    // Cells span from (-cw/2, -cw/2) at col=0/row=0 to (cols*cw - cw/2,
    // rows*cw - cw/2) at the far corner in `GridObject` local space.
    // Centre of that bbox is offset from the GridObject origin.
    const centerX = ((cols - 1) * cw) / 2;
    const centerZ = ((rows - 1) * cw) / 2;

    const panelW = gridW + 2 * cfg.padding;
    const panelD = gridD + 2 * cfg.padding;
    const radius = Math.min(cfg.cornerRadius, panelW / 2, panelD / 2);
    const panelShape = GameBoardsView._buildRoundedRectShape(panelW, panelD, radius);
    const panelMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(panelShape),
      new THREE.MeshBasicMaterial({ color: cfg.panelColor }),
    );
    panelMesh.name = "BlockPuzzle.GridPanel";
    panelMesh.rotation.x = -Math.PI / 2;
    panelMesh.position.set(centerX, 0.001, centerZ);
    gridObj.add(panelMesh);

    const separatorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(gridW, gridD),
      new THREE.MeshBasicMaterial({ color: cfg.separatorColor }),
    );
    separatorMesh.name = "BlockPuzzle.GridSeparator";
    separatorMesh.rotation.x = -Math.PI / 2;
    separatorMesh.position.set(centerX, 0.002, centerZ);
    gridObj.add(separatorMesh);
  }

  private static _buildRoundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
    const w = width;
    const h = depth;
    const r = radius;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return shape;
  }

  // IPointerInputHandler — the view does its own raycasting against
  // tray-piece meshes; `onThisObject` from the InputManager is unused.

  public onPointerDown(event: PointerEvent, _onThisObject: boolean): void {
    // Cell-tap takes priority when enabled (drag is off in that
    // mode anyway — see `setCellTapEnabled` callers).
    if (this._cellTapEnabled) {
      const cell = this._pickGridCell(event);
      if (cell !== null) {
        this._pendingCellTap = {
          col: cell.col,
          row: cell.row,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        };
      }
      return;
    }
    if (!this._dragEnabled) return;
    if (this._dragSession !== null) return;
    if (!this._config) return;
    // Try the Unit Block temp piece first — it sits in the tray area
    // but isn't owned by a tray cell, so the regular tray pickup
    // wouldn't find it.
    if (this._unitBlockGroup !== null && this._pickUnitBlock(event)) {
      this._beginUnitBlockDragSession(event);
      return;
    }
    const hit = this._pickTrayPiece(event);
    if (hit === null) return;
    this._beginDragSession(hit.trayCol, hit.cellItem, event);
  }

  public onPointerMove(event: PointerEvent, _onThisObject: boolean): void {
    const session = this._dragSession;
    if (session === null) return;
    if (event.pointerId !== session.pointerId) return;
    const ground = this._projectPointerToGround(event);
    if (ground === null) return;
    this._updateLiftedAt(session, ground);
    this._updateGhostAt(session, this._computeAnchorAt(session, ground));
  }

  public onPointerUp(event: PointerEvent, _onThisObject: boolean): void {
    // Resolve a pending cell-tap first — same pointer, within
    // threshold, and the up cell matches the down cell.
    const pending = this._pendingCellTap;
    if (pending !== null && pending.pointerId === event.pointerId) {
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      const finalHit = this._pickGridCell(event);
      const inside =
        Math.hypot(dx, dy) <= GameBoardsView.CELL_TAP_THRESHOLD_PX &&
        finalHit !== null &&
        finalHit.col === pending.col &&
        finalHit.row === pending.row;
      if (inside) {
        for (const cb of this._cellTapListeners) cb(pending.col, pending.row);
      }
      this._pendingCellTap = null;
      return;
    }
    const session = this._dragSession;
    if (session === null) return;
    if (event.pointerId !== session.pointerId) return;
    const ground = this._projectPointerToGround(event);
    const anchor = ground !== null ? this._computeAnchorAt(session, ground) : null;
    const footprint =
      anchor !== null ? GameBoardsView._footprintFor(anchor.col, anchor.row, session.cells) : null;
    const valid = footprint !== null && this._validityPredicate !== null && this._validityPredicate(footprint);
    if (valid && footprint !== null) {
      // Tear down view-side state BEFORE notifying the controller —
      // the controller's commit will fire `onItemRemoved` on the
      // tray item and remove its visual from the cell, which is fine
      // because we already un-parented our lifted visual. For Unit
      // Block the commit doesn't fire item-removed events on this
      // view; the discard happens inside `exitUnitBlockMode` when
      // the booster consume completes.
      if (session.source.kind === "tray") {
        const info: PiecePlacementInfo = {
          trayCol: session.source.trayCol,
          item: session.source.item,
          footprint,
        };
        this._endDragSession(false);
        for (const cb of this._placementListeners) cb(info);
      } else {
        this._endDragSession(false);
        for (const cb of this._unitBlockPlacementListeners) cb(footprint);
      }
    } else {
      this._endDragSession(true);
    }
  }

  public onPointerCancel(_event: PointerEvent): void {
    this._pendingCellTap = null;
    if (this._dragSession === null) return;
    this._endDragSession(true);
  }

  public override preDestroy(): void {
    this._placementListeners.clear();
    this._cellTapListeners.clear();
    this._unitBlockPlacementListeners.clear();
    this._trayEntryAnimations.clear();
    this._trayExitAnimations.clear();
    this._trayExitDoneCallback = null;
    if (this._world !== null) {
      this._world.scene.background = null;
    }
    for (const tex of this._gradientTextureCache.values()) {
      tex.dispose();
    }
    this._gradientTextureCache.clear();
    this._validityPredicate = null;
    this._clearPreviewProvider = null;
    this._trayPlaceability = null;
    this._pendingCellTap = null;
    if (this._dragSession !== null) this._endDragSession(true);
    if (this._unitBlockGroup !== null) {
      this.remove(this._unitBlockGroup);
      GameBoardsView._disposeGroupChildren(this._unitBlockGroup);
      this._unitBlockGroup = null;
    }
    if (this._dragRoot !== null) {
      this._dragRoot.removeFromParent();
      this._dragRoot = null;
    }
    if (this._ghostRoot !== null) {
      this._ghostRoot.removeFromParent();
      this._ghostRoot = null;
    }
    this._world = null;
    this._config = null;
    super.preDestroy();
  }

  private _beginDragSession(trayCol: number, cellItem: GameBoardItemObject, event: PointerEvent): void {
    if (!this._config || !this._dragRoot) return;
    const ground = this._projectPointerToGround(event);
    if (ground === null) return;
    const modelItem = GameBoardsView._readModelItem(cellItem);
    if (modelItem === null) {
      // `GameBoardItemObject`'s constructor stamps the back-reference,
      // so a missing modelItem is a structural error.
      throw new Error("GameBoardsView: tray cell item is missing model-item back-reference");
    }

    const pickupOffset = this._capturePickupOffset(cellItem, modelItem.cells, ground);

    cellItem.visible = false;

    // Carry the tray slot's faded state onto the lifted visual when
    // the piece is unplaceable — otherwise dragging would visually
    // "un-fade" the piece even though it can't be dropped anywhere.
    const placeable = this._trayPlaceability === null ? true : (this._trayPlaceability.get(trayCol) ?? true);
    const liftedOpacity = placeable ? 1 : this._config.trayUnplaceableOpacity;

    const liftedGroup = new THREE.Group();
    PieceMeshBuilder.appendBlocks(liftedGroup, modelItem.cells, this._config.gridCellSize, modelItem.color, {
      opacity: liftedOpacity,
      y: 0,
    });
    this._dragRoot.add(liftedGroup);
    this._dragRoot.visible = true;

    this._dragSession = {
      source: { kind: "tray", trayCol, item: modelItem, hiddenCellItem: cellItem },
      cells: modelItem.cells,
      color: modelItem.color,
      pointerId: event.pointerId,
      liftedGroup,
      pickupOffset,
    };

    this._updateLiftedAt(this._dragSession, ground);
    this._updateGhostAt(this._dragSession, this._computeAnchorAt(this._dragSession, ground));
  }

  /**
   * Tear-down. `restoreCellItem` controls whether the originating
   * tray-cell visual is un-hidden — `true` for invalid drops (the
   * piece returns to the slot), `false` for valid drops (the
   * controller's commit removes it via `onItemRemoved`).
   */
  private _endDragSession(restoreCellItem: boolean): void {
    const session = this._dragSession;
    if (session === null) return;
    this._dragSession = null;

    if (restoreCellItem) {
      if (session.source.kind === "tray") {
        session.source.hiddenCellItem.visible = true;
      } else {
        session.source.hiddenGroup.visible = true;
        // Unit Block snapped back to its idle pose — resume sparkle
        // emission at the (unchanged) home position.
        const home = session.source.hiddenGroup.position;
        this._setUnitBlockSparkleEmissionAt(home.x, home.z, true);
      }
    }

    if (this._dragRoot !== null) {
      session.liftedGroup.removeFromParent();
      this._dragRoot.visible = false;
    }
    GameBoardsView._disposeGroupChildren(session.liftedGroup);

    if (this._ghostRoot !== null) {
      GameBoardsView._clearGroup(this._ghostRoot);
      this._ghostRoot.visible = false;
    }
  }

  /**
   * Capture the world-space delta from the pointer to the piece's
   * top-left cell (cell (0, 0)) at grab time.
   *
   * X is overridden so the lifted piece is **horizontally centred**
   * on the touch X at pickup, regardless of where inside the tray
   * slot the player tapped: `pickupOffset.x = -((w - 1) / 2) *
   * gridCellSize`, derived purely from the piece's bbox width and
   * the grid block size the lifted piece renders at. Locking the
   * X delta means subsequent drag motion keeps the bbox centre
   * aligned with the cursor.
   *
   * Z keeps the natural grab offset (piece top-left vs pointer at
   * pickup, computed at tray block size — that's where the piece
   * actually was) and bakes the configured `drag.pickupLift` shift
   * into the captured value, so the piece floats above the cursor
   * for the rest of the drag.
   *
   * The captured offset is what every downstream consumer
   * (lifted-piece position, anchor / ghost computation, drop) uses,
   * so they all agree on the same elevated, centred reference.
   */
  private _capturePickupOffset(
    cellItem: GameBoardItemObject,
    cells: PieceCells,
    ground: { readonly x: number; readonly z: number },
  ): { x: number; z: number } {
    if (!this._config) throw new Error("GameBoardsView: config not injected");
    const { width, height } = PieceMeshBuilder.computeBbox(cells);
    const gridBlockSize = this._config.gridCellSize;
    const trayBlockSize = this._config.trayPieceCellSize;

    // X: centre the piece's bbox on the pointer at pickup. Cell (0, 0)
    // sits half a bbox-width to the left of the pointer; downstream
    // shifts the drag root by the same half-bbox to land cell (0, 0)
    // at `pointer + pickupOffset`, putting the bbox centre on the
    // cursor.
    const pickupOffsetX = -((width - 1) / 2) * gridBlockSize;

    // Z: natural grab offset (piece top-left in the tray slot vs
    // pointer at grab time) plus the configured lift in -Z.
    cellItem.getWorldPosition(this._scratchVec);
    const cellCenterZ = this._scratchVec.z;
    const topLeftCellWorldZ = cellCenterZ - ((height - 1) / 2) * trayBlockSize;
    const pickupOffsetZ = topLeftCellWorldZ - ground.z - this._config.drag.pickupLift;

    return { x: pickupOffsetX, z: pickupOffsetZ };
  }

  /**
   * Position the lifted piece. Free-tracks the pointer with the
   * captured `pickupOffset`: cell (0, 0) lands at
   * `pointer + pickupOffset`, regardless of where the ghost snapped.
   * The piece can extend past the grid edge — what the player sees
   * under their finger is always the same point on the piece they
   * grabbed. The bbox-centred render means we shift the drag root
   * by the half-bbox so cell (0, 0) lands at the desired point.
   */
  private _updateLiftedAt(session: DragSession, ground: { readonly x: number; readonly z: number }): void {
    if (this._dragRoot === null || this._config === null) return;
    const topLeftX = ground.x + session.pickupOffset.x;
    const topLeftZ = ground.z + session.pickupOffset.z;
    const { width, height } = PieceMeshBuilder.computeBbox(session.cells);
    const blockSize = this._config.gridCellSize;
    this._dragRoot.position.set(
      topLeftX + ((width - 1) / 2) * blockSize,
      this._config.drag.liftedY,
      topLeftZ + ((height - 1) / 2) * blockSize,
    );
  }

  /**
   * Show the ghost only when the anchor is non-null (pointer over
   * the placement area) AND the predicate accepts the footprint
   * (which after clamping reduces to: every target cell is empty).
   * The lifted piece and the ghost both derive from the same anchor,
   * so they visually align.
   */
  private _updateGhostAt(session: DragSession, anchor: { readonly col: number; readonly row: number } | null): void {
    if (this._ghostRoot === null || this._config === null) return;

    const hideGhost = (): void => {
      if (this._ghostRoot === null) return;
      GameBoardsView._clearGroup(this._ghostRoot);
      this._ghostRoot.visible = false;
    };

    if (anchor === null) {
      hideGhost();
      return;
    }
    const footprint = GameBoardsView._footprintFor(anchor.col, anchor.row, session.cells);
    const valid = this._validityPredicate !== null && this._validityPredicate(footprint);
    if (!valid) {
      hideGhost();
      return;
    }

    const grid = this.getGridObject(this._config.boardIds.grid);
    if (!grid) {
      hideGhost();
      return;
    }
    GameBoardsView._clearGroup(this._ghostRoot);
    grid.getWorldPosition(this._scratchVec);
    this._ghostRoot.position.set(this._scratchVec.x, this._config.drag.ghostY, this._scratchVec.z);

    // Two visual layers on the ghost root:
    // - Footprint cells (the piece the player is dropping) render
    //   translucent at `drag.ghostOpacity` — "this is where the
    //   piece would land", with the underlying empty cell paint
    //   showing through.
    // - Line-clear cells (the rest of the rows/columns that would
    //   clear) render fully opaque in the same piece colour —
    //   "these cells are about to disappear", completely replacing
    //   the existing block colours so the preview reads as a clean
    //   solid line, not a tinted blend.
    const preview = this._clearPreviewProvider?.(footprint) ?? GameBoardsView._EMPTY_CLEAR_PREVIEW;
    const footprintKeys = new Set<string>();
    for (const c of footprint) footprintKeys.add(`${c.col},${c.row}`);
    const clearOnly: GridCoord[] = [];
    const seen = new Set<string>();
    for (const c of preview.cells) {
      const key = `${c.col},${c.row}`;
      if (footprintKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
      clearOnly.push(c);
    }

    const cellSize = this._config.gridCellSize;
    const drawSize = cellSize * PieceMeshBuilder.BLOCK_INSET;
    const ghostOpacity = this._config.drag.ghostOpacity;

    for (const { col, row } of footprint) {
      const geom = new THREE.PlaneGeometry(drawSize, drawSize);
      const mat = new THREE.MeshBasicMaterial({
        color: session.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: ghostOpacity,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(col * cellSize, 0, row * cellSize);
      this._ghostRoot.add(mesh);
    }
    for (const { col, row } of clearOnly) {
      const geom = new THREE.PlaneGeometry(drawSize, drawSize);
      const mat = new THREE.MeshBasicMaterial({
        color: session.color,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(col * cellSize, 0, row * cellSize);
      this._ghostRoot.add(mesh);
    }

    // Glowing white frame around each cleared row + column. Each
    // line gets its own frame (rows and columns overlap naturally
    // where they intersect since the strips are drawn independently).
    const totalCols = grid.columnCount;
    const totalRows = grid.rowCount;
    const halfCell = cellSize / 2;
    for (const r of preview.fullRows) {
      const minX = -halfCell;
      const maxX = totalCols * cellSize - halfCell;
      const minZ = r * cellSize - halfCell;
      const maxZ = r * cellSize + halfCell;
      this._buildClearLineOutline(this._ghostRoot, minX, maxX, minZ, maxZ);
    }
    for (const c of preview.fullCols) {
      const minX = c * cellSize - halfCell;
      const maxX = c * cellSize + halfCell;
      const minZ = -halfCell;
      const maxZ = totalRows * cellSize - halfCell;
      this._buildClearLineOutline(this._ghostRoot, minX, maxX, minZ, maxZ);
    }

    this._ghostRoot.visible = true;
  }

  /**
   * Build a glowing frame around `[minX..maxX] × [minZ..maxZ]` and
   * append the strips to `parent`. Inner solid frame + outer halo
   * frame fakes a glow without post-processing — each frame is four
   * thin `PlaneGeometry` strips (top / bottom / left / right). All
   * strips render slightly above the ghost-root's local origin so
   * they sit on top of the cell highlights underneath.
   */
  private _buildClearLineOutline(
    parent: THREE.Group,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): void {
    if (!this._config) return;
    const cfg = this._config.drag.clearPreviewOutline;
    // Halo first so the solid inner frame paints over its inner
    // edge — gives a soft outside, crisp inside look.
    GameBoardsView._appendFrameStrips(
      parent,
      minX - cfg.haloPadding,
      maxX + cfg.haloPadding,
      minZ - cfg.haloPadding,
      maxZ + cfg.haloPadding,
      cfg.thickness + cfg.haloPadding,
      cfg.haloColor,
      cfg.haloAlpha,
      0.0005,
    );
    GameBoardsView._appendFrameStrips(
      parent,
      minX,
      maxX,
      minZ,
      maxZ,
      cfg.thickness,
      cfg.color,
      1,
      0.001,
    );
  }

  private static _appendFrameStrips(
    parent: THREE.Group,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    thickness: number,
    color: number,
    opacity: number,
    y: number,
  ): void {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const transparent = opacity < 1;
    const make = (sx: number, sz: number, cx: number, cz: number): void => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent,
        opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, y, cz);
      parent.add(mesh);
    };
    // Top + bottom strips run the full width; left + right strips
    // span the inner depth so corners are covered by the top/bottom
    // bars (no gap, no double-paint).
    make(w, thickness, minX + w / 2, minZ + thickness / 2);
    make(w, thickness, minX + w / 2, maxZ - thickness / 2);
    const innerD = Math.max(0, d - 2 * thickness);
    if (innerD > 0) {
      make(thickness, innerD, minX + thickness / 2, minZ + thickness + innerD / 2);
      make(thickness, innerD, maxX - thickness / 2, minZ + thickness + innerD / 2);
    }
  }

  private static readonly _EMPTY_CLEAR_PREVIEW = {
    cells: [] as readonly GridCoord[],
    fullRows: [] as readonly number[],
    fullCols: [] as readonly number[],
  };

  /**
   * Piece-bbox overlap gate + clamp-into-bounds anchor.
   *
   * Returns `null` when the **dragged piece's bbox** doesn't overlap
   * the grid extended by `drag.pointerAreaMargin` cells on every
   * side. The gate tracks the piece's position rather than the
   * pointer because `drag.pickupLift` shifts the piece up off the
   * cursor — a pointer-based gate would hide the ghost the moment
   * the player's finger dipped below the grid, even though the piece
   * was clearly hovering over it.
   *
   * Otherwise returns the anchor cell: the raw target from the
   * piece's top-left (round-to-nearest), clamped to
   * `[0, gridCols - pieceCols]` and `[0, gridRows - pieceRows]` so
   * the full footprint always fits inside the grid. The clamp is
   * what gives the piece its magnetic-to-edges feel — pointer near a
   * corner snaps the piece to that corner regardless of which part
   * of the piece was grabbed. After the clamp, occupancy is the
   * only thing the validity predicate has to check.
   */
  private _computeAnchorAt(
    session: DragSession,
    ground: { readonly x: number; readonly z: number },
  ): { col: number; row: number } | null {
    if (!this._config) return null;
    const grid = this.getGridObject(this._config.boardIds.grid);
    if (!grid) return null;
    grid.getWorldPosition(this._scratchVec);
    const cellSize = this._config.gridCellSize;
    const margin = this._config.drag.pointerAreaMargin;

    // Piece top-left in grid-local cell units (continuous, not yet
    // rounded). Drives both the bbox-overlap gate below and the
    // clamp-into-bounds anchor afterwards.
    const topLeftX = ground.x + session.pickupOffset.x;
    const topLeftZ = ground.z + session.pickupOffset.z;
    const topLeftCol = (topLeftX - this._scratchVec.x) / cellSize;
    const topLeftRow = (topLeftZ - this._scratchVec.z) / cellSize;
    const { width: pieceCols, height: pieceRows } = PieceMeshBuilder.computeBbox(session.cells);

    // Piece-bbox overlap gate. In cell units the grid spans
    // `[-0.5, gridCols - 0.5]`, the piece spans `[topLeftCol - 0.5,
    // topLeftCol + pieceCols - 0.5]`. Adding the margin to the grid
    // and applying AABB overlap simplifies to `topLeftCol >
    // -pieceCols - margin && topLeftCol < gridCols + margin`.
    if (topLeftCol <= -pieceCols - margin) return null;
    if (topLeftCol >= grid.columnCount + margin) return null;
    if (topLeftRow <= -pieceRows - margin) return null;
    if (topLeftRow >= grid.rowCount + margin) return null;

    // Clamp anchor so the entire footprint stays inside the grid.
    const rawCol = Math.round(topLeftCol);
    const rawRow = Math.round(topLeftRow);
    const maxAnchorCol = Math.max(0, grid.columnCount - pieceCols);
    const maxAnchorRow = Math.max(0, grid.rowCount - pieceRows);
    const col = Math.max(0, Math.min(maxAnchorCol, rawCol));
    const row = Math.max(0, Math.min(maxAnchorRow, rawRow));
    return { col, row };
  }

  private static _footprintFor(anchorCol: number, anchorRow: number, cells: PieceCells): GridCoord[] {
    const out: GridCoord[] = [];
    for (const [c, r] of cells) {
      out.push({ col: anchorCol + c, row: anchorRow + r });
    }
    return out;
  }

  /**
   * Pointer-to-cell mapping for the playing grid. Returns the
   * cell directly under the pointer (using the same ground-plane
   * projection the drag pipeline uses), or `null` when the
   * projection lands outside the grid bounds. Used by the cell-tap
   * flow for booster target selection.
   */
  private _pickGridCell(event: PointerEvent): { readonly col: number; readonly row: number } | null {
    if (!this._world || !this._config) return null;
    const ground = this._projectPointerToGround(event);
    if (ground === null) return null;
    const grid = this.getGridObject(this._config.boardIds.grid);
    if (!grid) return null;
    grid.getWorldPosition(this._scratchVec);
    const cellSize = this._config.gridCellSize;
    const col = Math.round((ground.x - this._scratchVec.x) / cellSize);
    const row = Math.round((ground.z - this._scratchVec.z) / cellSize);
    if (col < 0 || col >= grid.columnCount) return null;
    if (row < 0 || row >= grid.rowCount) return null;
    return { col, row };
  }

  /**
   * Raycast against every visible tray-cell item's block meshes
   * **and** the tray cell paint behind it, then return the hit
   * piece (plus its tray column). Folding the cell fill into the
   * hit-test set extends the interaction area beyond the piece
   * visual itself — important for narrow shapes like a vertical
   * 1×5 line where the piece blocks cover only a sliver of the
   * slot's width. The piece's model back-reference is recovered
   * later via {@link _readModelItem}.
   */
  private _pickTrayPiece(event: PointerEvent): { readonly trayCol: number; readonly cellItem: GameBoardItemObject } | null {
    if (!this._world || !this._config) return null;
    if (!this._updatePointerNdc(event)) return null;
    const trayObj = this.getGridObject(this._config.boardIds.tray);
    if (!trayObj) return null;

    const meshes: THREE.Mesh[] = [];
    const meshToItem = new Map<THREE.Object3D, { readonly trayCol: number; readonly cellItem: GameBoardItemObject }>();
    for (let col = 0; col < trayObj.columnCount; col++) {
      const cell = trayObj.getCell(col, 0);
      if (!cell?.item) continue;
      if (!cell.item.visible) continue;
      if (!(cell.item instanceof GameBoardItemObject)) continue;
      // Pieces mid-slide aren't tappable — they haven't visually
      // settled into their slot (entry) or are on their way off
      // (exit). The booster panel is already disabled during a
      // Tray Refresh exit phase, but defending here too keeps the
      // pickup gate self-consistent.
      if (this._trayEntryAnimations.has(cell.item)) continue;
      if (this._trayExitAnimations.has(cell.item)) continue;
      const ref = { trayCol: col, cellItem: cell.item };
      for (const mesh of cell.item.pickableMeshes) {
        if (mesh instanceof THREE.Mesh) {
          meshes.push(mesh);
          meshToItem.set(mesh, ref);
        }
      }
      // Extended hit area: the cell paint behind the piece. A tap
      // anywhere on the slot's coloured fill picks up its piece, so
      // narrow shapes (vertical lines, small L's) aren't fiddly to
      // grab.
      if (cell instanceof GameBoardCellObject && cell.fillMesh !== null) {
        meshes.push(cell.fillMesh);
        meshToItem.set(cell.fillMesh, ref);
      }
    }
    if (meshes.length === 0) return null;

    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hit = hits[0]!.object;
    return meshToItem.get(hit) ?? null;
  }

  private _projectPointerToGround(event: PointerEvent): { readonly x: number; readonly z: number } | null {
    if (!this._world) return null;
    if (!this._updatePointerNdc(event)) return null;
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._groundHit);
    if (!hit) return null;
    return { x: this._groundHit.x, z: this._groundHit.z };
  }

  private _updatePointerNdc(event: PointerEvent): boolean {
    if (!this._world) return false;
    const canvas = this._world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  /**
   * Resolve the model `GameBoardItem` behind a visual cell item. The
   * back-reference is stamped onto `userData` in
   * `GameBoardItemObject`'s constructor so the view can recover the
   * model item without going through DI.
   */
  private static _readModelItem(visual: GameBoardItemObject): GameBoardItem | null {
    const ref = visual.userData["modelItem"];
    return ref instanceof GameBoardItem ? ref : null;
  }

  private static _clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[group.children.length - 1]!;
      group.remove(child);
      GameBoardsView._disposeNode(child);
    }
  }

  private static _disposeGroupChildren(group: THREE.Group): void {
    group.traverse((node) => GameBoardsView._disposeNode(node));
  }

  private static _disposeNode(node: THREE.Object3D): void {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry?.dispose();
    const mat = node.material as THREE.Material | readonly THREE.Material[];
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose();
    } else {
      (mat as THREE.Material).dispose();
    }
  }
}
