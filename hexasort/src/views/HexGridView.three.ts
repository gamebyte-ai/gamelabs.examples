import * as THREE from "three";
import gsap from "gsap";
import { World, WorldViewBase, type IHexGrid, type IInstanceResolver, type IPointerInputHandler, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { HexCellCoord, IHexGridView } from "./IHexGridView.js";
import { HexaSortConfig } from "../HexaSortConfig.js";
import { hexCellKey } from "../utilities/HexNeighbors.js";

type CellRecord = {
  readonly col: number;
  readonly row: number;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
};

/**
 * Renders a {@link HexGrid} as a group of 3D hex prisms standing edge-to-edge
 * on the XZ plane. Hosts placed {@link BlockStack}s as vertical block
 * columns above their cells.
 *
 * Rendering:
 * - Each cell is a `CylinderGeometry(r, r, h, 6)` — flat-top hex prism.
 * - Cells share an `EdgesGeometry` for outline lines but get their own
 *   `MeshStandardMaterial` instance so individual cells can be highlighted.
 * - Placed block prisms are children of the cell mesh so they inherit the
 *   grid's Y rotation (rotation applies to the grid as a whole — never to
 *   individual cells or blocks).
 *
 * Input:
 * - Implements {@link IPointerInputHandler}. Forwards horizontal drag deltas
 *   (for controller-driven rotation) and raycasts its own cell meshes to
 *   emit hovered-cell changes to the controller.
 */
export class HexGridView extends WorldViewBase implements IHexGridView, IPointerInputHandler {
  private _config: HexaSortConfig | null = null;
  private _world: World | null = null;

  private readonly _cellsByKey = new Map<number, CellRecord>();
  private readonly _cellMeshes: THREE.Mesh[] = [];
  private _cellGeometry: THREE.CylinderGeometry | null = null;
  private _edgeGeometry: THREE.EdgesGeometry | null = null;
  private _edgeMaterial: THREE.LineBasicMaterial | null = null;

  private _blockGeometry: THREE.CylinderGeometry | null = null;
  private readonly _blockMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly _blocksByCell = new Map<number, THREE.Mesh[]>();

  private _highlightedCell: HexCellCoord | null = null;
  private _hoveredCell: HexCellCoord | null = null;
  private readonly _hoverListeners = new Set<(cell: HexCellCoord | null) => void>();

  private _isDragging = false;
  private _activePointerId: number | null = null;
  private _lastClientX = 0;
  private readonly _dragListeners = new Set<(dx: number) => void>();

  /** Active gsap tweens keyed by the object whose properties they animate. */
  private readonly _activeTweens = new Set<gsap.core.Tween>();

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(HexaSortConfig);
    this._world = resolver.getInstance(World);
  }

  public buildGrid(grid: IHexGrid): void {
    this._clearGrid();
    const cfg = this._requireConfig();

    const visualRadius = grid.preset.hexSize * cfg.hexFillRatio;
    this._cellGeometry = HexGridView._createFlatTopHexPrismGeometry(visualRadius, cfg.hexHeight);
    this._edgeGeometry = new THREE.EdgesGeometry(this._cellGeometry);
    this._edgeMaterial = new THREE.LineBasicMaterial({ color: cfg.cellEdgeColor });
    this._blockGeometry = HexGridView._createFlatTopHexPrismGeometry(visualRadius, cfg.blockHeight);

    const center = grid.preset.getCenterOffset();
    const baseY = cfg.hexHeight * 0.5;

    for (let col = 0; col < grid.preset.columnCount; col++) {
      for (let row = 0; row < grid.preset.rowCount; row++) {
        const pos = grid.preset.getCellPosition(col, row);
        const material = new THREE.MeshStandardMaterial({ color: cfg.cellColor, metalness: 0.05, roughness: 0.85 });
        const mesh = new THREE.Mesh(this._cellGeometry, material);
        mesh.position.set(pos.x - center.x, baseY, pos.z - center.z);
        mesh.userData = { col, row };
        const edges = new THREE.LineSegments(this._edgeGeometry, this._edgeMaterial);
        mesh.add(edges);
        this.add(mesh);
        this._cellMeshes.push(mesh);
        this._cellsByKey.set(hexCellKey(col, row), { col, row, mesh, material });
      }
    }
  }

  public setRotationY(radians: number): void {
    this.rotation.y = radians;
  }

  public onHorizontalDrag(callback: (deltaPixelsX: number) => void): Unsubscribe {
    this._dragListeners.add(callback);
    return () => {
      this._dragListeners.delete(callback);
    };
  }

  public onCellHoverChanged(callback: (cell: HexCellCoord | null) => void): Unsubscribe {
    this._hoverListeners.add(callback);
    return () => {
      this._hoverListeners.delete(callback);
    };
  }

  public setHighlightedCell(col: number, row: number): void {
    const cfg = this._requireConfig();
    const next = this._cellsByKey.get(hexCellKey(col, row));
    if (!next) return;
    if (this._highlightedCell && (this._highlightedCell.col !== col || this._highlightedCell.row !== row)) {
      this._restoreCellColor(this._highlightedCell.col, this._highlightedCell.row);
    }
    next.material.color.setHex(cfg.cellHighlightColor);
    this._highlightedCell = { col, row };
  }

  public clearHighlight(): void {
    if (!this._highlightedCell) return;
    this._restoreCellColor(this._highlightedCell.col, this._highlightedCell.row);
    this._highlightedCell = null;
  }

  public renderBlockStack(col: number, row: number, colors: readonly number[]): void {
    for (let i = 0; i < colors.length; i++) this.pushTopBlock(col, row, colors[i]!);
  }

  public popTopBlock(col: number, row: number): void {
    const key = hexCellKey(col, row);
    const blocks = this._blocksByCell.get(key);
    if (!blocks || blocks.length === 0) return;
    const mesh = blocks.pop()!;
    mesh.removeFromParent();
    if (blocks.length === 0) this._blocksByCell.delete(key);
  }

  public pushTopBlock(col: number, row: number, colorIndex: number): void {
    const cfg = this._requireConfig();
    const record = this._cellsByKey.get(hexCellKey(col, row));
    if (!record || !this._blockGeometry) return;

    const material = this._getOrCreateBlockMaterial(colorIndex);
    const block = new THREE.Mesh(this._blockGeometry, material);

    const key = hexCellKey(col, row);
    let blocks = this._blocksByCell.get(key);
    if (!blocks) {
      blocks = [];
      this._blocksByCell.set(key, blocks);
    }
    const stackIndex = blocks.length;
    // Cell mesh origin is at its vertical center, so lift by `hexHeight/2` to
    // reach the cell's top face, then by `blockHeight · (i + 0.5)` to center
    // the i-th block on its layer (bottom → top).
    block.position.set(0, cfg.hexHeight * 0.5 + cfg.blockHeight * (stackIndex + 0.5), 0);
    record.mesh.add(block);
    blocks.push(block);
  }

  public animateBlockMove(
    sourceCol: number,
    sourceRow: number,
    targetCol: number,
    targetRow: number,
    colorIndex: number,
    onComplete: () => void,
  ): void {
    const cfg = this._requireConfig();
    const sourceRecord = this._cellsByKey.get(hexCellKey(sourceCol, sourceRow));
    const targetRecord = this._cellsByKey.get(hexCellKey(targetCol, targetRow));
    if (!sourceRecord || !targetRecord || !this._blockGeometry) {
      onComplete();
      return;
    }

    // Pop the source's top mesh (tracking + scene) BEFORE starting the
    // tween so the source visual immediately reflects one less block.
    const sourceKey = hexCellKey(sourceCol, sourceRow);
    const sourceBlocks = this._blocksByCell.get(sourceKey);
    if (sourceBlocks && sourceBlocks.length > 0) {
      const topMesh = sourceBlocks.pop()!;
      topMesh.removeFromParent();
      if (sourceBlocks.length === 0) this._blocksByCell.delete(sourceKey);
    }

    // Compute start/end in HexGridView-local space. Cells have no rotation
    // relative to this group, so block-in-HexGridView y =
    // `hexHeight + blockHeight · (stackIndex + 0.5)` (cell center is at
    // `hexHeight/2`, block center is at `hexHeight/2 + blockHeight·(i+0.5)`
    // within the cell).
    const srcStackIndex = sourceBlocks?.length ?? 0;
    const startLocal = new THREE.Vector3(
      sourceRecord.mesh.position.x,
      cfg.hexHeight + cfg.blockHeight * (srcStackIndex + 0.5),
      sourceRecord.mesh.position.z,
    );
    const targetBlocks = this._blocksByCell.get(hexCellKey(targetCol, targetRow));
    const tgtNextStackIndex = targetBlocks?.length ?? 0;
    const endLocal = new THREE.Vector3(
      targetRecord.mesh.position.x,
      cfg.hexHeight + cfg.blockHeight * (tgtNextStackIndex + 0.5),
      targetRecord.mesh.position.z,
    );

    // Flying mesh is a child of this HexGridView group so it inherits the
    // grid's Y rotation — the user can keep rotating during the tween and
    // the block travels correctly relative to the rotating board.
    const material = this._getOrCreateBlockMaterial(colorIndex);
    const flying = new THREE.Mesh(this._blockGeometry, material);
    flying.position.copy(startLocal);
    this.add(flying);

    // Rotation axis: perpendicular to the horizontal travel direction in
    // the grid's XZ plane. Rotating a Y-aligned prism around this axis
    // produces an end-over-end "card-flip" tumble along the path of
    // travel. `(dz, 0, -dx)` is the 90° clockwise (top-down) rotation of
    // the motion vector — when the block moves in +X, the flip axis is
    // -Z, so the leading edge dips forward first (a natural toss).
    const dx = endLocal.x - startLocal.x;
    const dz = endLocal.z - startLocal.z;
    const rawAxis = new THREE.Vector3(dz, 0, -dx);
    const axisLen = rawAxis.length();
    const flipAxis = axisLen > 1e-4 ? rawAxis.divideScalar(axisLen) : new THREE.Vector3(1, 0, 0);

    const duration = cfg.animSortMoveSeconds;
    const totalAngle = Math.PI * 2 * cfg.animFlipRevolutions;
    const arcPeak = cfg.animFlipArcHeight;
    const tmpQuat = new THREE.Quaternion();
    const progress = { t: 0 };

    // One linear progress tween drives the whole trajectory so XZ motion,
    // parabolic Y arc, and flip quaternion advance in lockstep.
    const tween = gsap.to(progress, {
      t: 1,
      duration,
      ease: "none",
      onUpdate: () => {
        const t = progress.t;
        flying.position.x = startLocal.x + (endLocal.x - startLocal.x) * t;
        flying.position.z = startLocal.z + (endLocal.z - startLocal.z) * t;
        // Linear baseline + `4t(1-t)` parabola (peaks at t = 0.5) — gives
        // a natural toss arc regardless of start/end height difference.
        const baseY = startLocal.y + (endLocal.y - startLocal.y) * t;
        flying.position.y = baseY + 4 * t * (1 - t) * arcPeak;
        tmpQuat.setFromAxisAngle(flipAxis, t * totalAngle);
        flying.quaternion.copy(tmpQuat);
      },
      onComplete: () => {
        this._activeTweens.delete(tween);
        flying.removeFromParent();
        // Fresh mesh with identity rotation lands flat on the target stack.
        this.pushTopBlock(targetCol, targetRow, colorIndex);
        onComplete();
      },
    });
    this._activeTweens.add(tween);
  }

  public animateBlockDestroy(col: number, row: number, onComplete: () => void): void {
    const cfg = this._requireConfig();
    const key = hexCellKey(col, row);
    const blocks = this._blocksByCell.get(key);
    if (!blocks || blocks.length === 0) {
      onComplete();
      return;
    }
    const topMesh = blocks.pop()!;
    if (blocks.length === 0) this._blocksByCell.delete(key);

    const tween = gsap.to(topMesh.scale, {
      x: 0,
      y: 0,
      z: 0,
      duration: cfg.animDestroyScaleSeconds,
      ease: "power2.in",
      onComplete: () => {
        this._activeTweens.delete(tween);
        topMesh.removeFromParent();
        onComplete();
      },
    });
    this._activeTweens.add(tween);
  }

  // IPointerInputHandler — fires for every canvas pointer event. This view
  // relies on its own raycast (below) to determine whether the pointer is
  // on a cell; `onThisObject` from the InputManager is not used because our
  // meshes are not published to `POINTER_INPUT_LAYER`.
  public onPointerDown(event: PointerEvent, _onThisObject: boolean): void {
    const hit = this._raycastCell(event);
    this._setHoveredCell(hit);
    if (this._isDragging) return;
    if (!hit) return; // rotation drag starts only when the pointer is on the grid
    this._isDragging = true;
    this._activePointerId = event.pointerId;
    this._lastClientX = event.clientX;
  }

  public onPointerMove(event: PointerEvent, _onThisObject: boolean): void {
    this._updateHover(event);
    if (!this._isDragging) return;
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    const dx = event.clientX - this._lastClientX;
    this._lastClientX = event.clientX;
    if (dx === 0) return;
    for (const cb of this._dragListeners) cb(dx);
  }

  public onPointerUp(event: PointerEvent, _onThisObject: boolean): void {
    if (this._activePointerId === null || event.pointerId === this._activePointerId) this._endDrag();
    this._updateHover(event);
  }

  public onPointerCancel(_event: PointerEvent): void {
    this._endDrag();
    this._setHoveredCell(null);
  }

  public override preDestroy(): void {
    // Kill in-flight tweens before disposing meshes so gsap doesn't keep
    // writing to freed geometry/material refs. `kill()` fires onComplete
    // only if `.kill(true)` is used; we want silent cancellation.
    for (const tween of this._activeTweens) tween.kill();
    this._activeTweens.clear();
    this._hoverListeners.clear();
    this._dragListeners.clear();
    this._endDrag();
    this._clearGrid();
    super.preDestroy();
  }

  private _updateHover(event: PointerEvent): void {
    const hit = this._raycastCell(event);
    this._setHoveredCell(hit);
  }

  private _setHoveredCell(cell: HexCellCoord | null): void {
    const current = this._hoveredCell;
    const same =
      (current === null && cell === null) ||
      (current !== null && cell !== null && current.col === cell.col && current.row === cell.row);
    if (same) return;
    this._hoveredCell = cell;
    for (const cb of this._hoverListeners) cb(cell);
  }

  private _raycastCell(event: PointerEvent): HexCellCoord | null {
    if (!this._world || this._cellMeshes.length === 0) return null;
    const canvas = this._world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const hits = this._raycaster.intersectObjects(this._cellMeshes, false);
    if (hits.length === 0) return null;
    const data = hits[0]!.object.userData as { col?: number; row?: number };
    if (typeof data.col !== "number" || typeof data.row !== "number") return null;
    return { col: data.col, row: data.row };
  }

  private _endDrag(): void {
    this._isDragging = false;
    this._activePointerId = null;
  }

  private _restoreCellColor(col: number, row: number): void {
    const cfg = this._requireConfig();
    const record = this._cellsByKey.get(hexCellKey(col, row));
    if (record) record.material.color.setHex(cfg.cellColor);
  }

  private _getOrCreateBlockMaterial(colorIdx: number): THREE.MeshStandardMaterial {
    const cfg = this._requireConfig();
    const existing = this._blockMaterials[colorIdx];
    if (existing) return existing;
    const palette = cfg.blockColors;
    const hex = palette[colorIdx % palette.length]!;
    const material = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.1, roughness: 0.6 });
    this._blockMaterials[colorIdx] = material;
    return material;
  }

  private _clearGrid(): void {
    for (const blocks of this._blocksByCell.values()) {
      for (const mesh of blocks) mesh.removeFromParent();
    }
    this._blocksByCell.clear();
    for (const mat of this._blockMaterials) mat?.dispose();
    this._blockMaterials.length = 0;

    for (const record of this._cellsByKey.values()) {
      record.mesh.removeFromParent();
      record.material.dispose();
    }
    this._cellsByKey.clear();
    this._cellMeshes.length = 0;
    this._highlightedCell = null;
    this._hoveredCell = null;

    this._cellGeometry?.dispose();
    this._cellGeometry = null;
    this._edgeGeometry?.dispose();
    this._edgeGeometry = null;
    this._edgeMaterial?.dispose();
    this._edgeMaterial = null;
    this._blockGeometry?.dispose();
    this._blockGeometry = null;
  }

  private _requireConfig(): HexaSortConfig {
    if (!this._config) throw new Error("HexGridView is not initialized");
    return this._config;
  }

  /**
   * Hex prism aligned with the Y axis in flat-top orientation.
   *
   * THREE.CylinderGeometry places its first vertex at `(sin θ · r, y, cos θ · r)`,
   * so the default (`thetaStart = 0`) puts a point on +Z — a pointy-top hex.
   * The flat-top layout in {@link HexGrid.getCellPosition} expects points on
   * ±X and flat edges on ±Z; rotating the geometry by `π/6` (30°) via
   * `thetaStart` achieves that and makes adjacent cells meet edge-to-edge at
   * center-to-center distance `√3 · r` (= `2 · apothem`).
   */
  private static _createFlatTopHexPrismGeometry(radius: number, height: number): THREE.CylinderGeometry {
    return new THREE.CylinderGeometry(radius, radius, height, 6, 1, false, Math.PI / 6);
  }
}
