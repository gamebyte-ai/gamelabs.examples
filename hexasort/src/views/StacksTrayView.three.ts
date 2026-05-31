import * as THREE from "three";
import { World, WorldViewBase, type IInstanceResolver, type IPointerInputHandler, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { BlockStack } from "../models/BlockStack.js";
import type { IStacksTrayView } from "./IStacksTrayView.js";
import { HexaSortConfig } from "../HexaSortConfig.js";

type SlotRecord = {
  readonly index: number;
  readonly home: THREE.Vector3;
  readonly group: THREE.Group;
  readonly pickableMeshes: THREE.Mesh[];
};

/**
 * Renders the bottom-of-screen tray of selectable {@link BlockStack}s as 3D
 * block columns in front of the grid.
 *
 * Input:
 * - Implements {@link IPointerInputHandler}. On pointer down that raycasts
 *   to a stack's blocks, reports the slot to the controller and begins
 *   following the pointer on subsequent moves (projected onto the y=0
 *   plane, lifted by `config.stackLiftHeight`).
 * - On pointer up while dragging, notifies the controller; the controller
 *   decides placement and calls back to `removeSlotVisual` or
 *   `resetSlotVisual`, and on a successful drop `addSlotStack` spawns a
 *   fresh stack into the same slot.
 *
 * This view never writes to any model or to the hex grid — it only moves
 * its own visuals and reports events.
 */
export class StacksTrayView extends WorldViewBase implements IStacksTrayView, IPointerInputHandler {
  private _config: HexaSortConfig | null = null;
  private _world: World | null = null;

  private readonly _slotRecords = new Map<number, SlotRecord>();
  private _slotCount = 0;
  private _blockGeometry: THREE.CylinderGeometry | null = null;
  private _edgeGeometry: THREE.EdgesGeometry | null = null;
  private _edgeMaterial: THREE.LineBasicMaterial | null = null;
  private readonly _blockMaterials: THREE.MeshStandardMaterial[] = [];

  private _draggedSlot: number | null = null;
  private _activePointerId: number | null = null;

  private readonly _pressListeners = new Set<(slotIndex: number) => void>();
  private readonly _releaseListeners = new Set<() => void>();

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _groundHit = new THREE.Vector3();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(HexaSortConfig);
    this._world = resolver.getInstance(World);
  }

  public buildTray(slots: readonly (BlockStack | null)[]): void {
    this._clearTray();
    const cfg = this._requireConfig();

    const radius = cfg.hexSize * cfg.hexFillRatio;
    // `thetaStart = π/6` rotates the 6-sided cylinder so it renders as a
    // flat-top hex prism (points on ±X, flats on ±Z) — consistent with the
    // grid's flat-top layout.
    this._blockGeometry = new THREE.CylinderGeometry(radius, radius, cfg.blockHeight, 6, 1, false, Math.PI / 6);
    this._edgeGeometry = new THREE.EdgesGeometry(this._blockGeometry);
    this._edgeMaterial = new THREE.LineBasicMaterial({ color: cfg.cellEdgeColor });
    this._slotCount = slots.length;

    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i]!;
      if (stack) this.addSlotStack(i, stack);
    }
  }

  public addSlotStack(slotIndex: number, stack: BlockStack): void {
    if (!this._blockGeometry || !this._edgeGeometry || !this._edgeMaterial) {
      throw new Error("StacksTrayView.buildTray must be called before addSlotStack");
    }
    if (this._slotRecords.has(slotIndex)) return;
    const cfg = this._requireConfig();

    const home = this._computeSlotHome(slotIndex);
    const group = new THREE.Group();
    group.position.copy(home);
    this.add(group);

    const pickableMeshes: THREE.Mesh[] = [];
    for (let b = 0; b < stack.colors.length; b++) {
      const colorIdx = stack.colors[b]!;
      const material = this._getOrCreateBlockMaterial(colorIdx);
      const block = new THREE.Mesh(this._blockGeometry, material);
      block.position.set(0, cfg.blockHeight * (b + 0.5), 0);
      block.userData = { slotIndex };
      const edges = new THREE.LineSegments(this._edgeGeometry, this._edgeMaterial);
      block.add(edges);
      group.add(block);
      pickableMeshes.push(block);
    }

    this._slotRecords.set(slotIndex, { index: slotIndex, home, group, pickableMeshes });
  }

  public onStackPressed(callback: (slotIndex: number) => void): Unsubscribe {
    this._pressListeners.add(callback);
    return () => {
      this._pressListeners.delete(callback);
    };
  }

  public onPointerReleased(callback: () => void): Unsubscribe {
    this._releaseListeners.add(callback);
    return () => {
      this._releaseListeners.delete(callback);
    };
  }

  public removeSlotVisual(slotIndex: number): void {
    const record = this._slotRecords.get(slotIndex);
    if (!record) return;
    record.group.removeFromParent();
    // Meshes reuse shared geometry/materials; group removal is enough.
    this._slotRecords.delete(slotIndex);
  }

  public resetSlotVisual(slotIndex: number): void {
    const record = this._slotRecords.get(slotIndex);
    if (!record) return;
    record.group.position.copy(record.home);
  }

  // IPointerInputHandler — fires for every canvas pointer event. This view
  // relies on its own raycast against its block meshes; `onThisObject` from
  // the InputManager is not used because our meshes are not published to
  // `POINTER_INPUT_LAYER`.
  public onPointerDown(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedSlot !== null) return;
    const slotIndex = this._raycastSlot(event);
    if (slotIndex === null) return;
    this._draggedSlot = slotIndex;
    this._activePointerId = event.pointerId;
    this._updateDragPosition(event);
    for (const cb of this._pressListeners) cb(slotIndex);
  }

  public onPointerMove(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedSlot === null) return;
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    this._updateDragPosition(event);
  }

  public onPointerUp(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedSlot === null) return;
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    this._endDrag();
    for (const cb of this._releaseListeners) cb();
  }

  public onPointerCancel(_event: PointerEvent): void {
    if (this._draggedSlot === null) return;
    const slot = this._draggedSlot;
    this._endDrag();
    this.resetSlotVisual(slot);
  }

  public override preDestroy(): void {
    this._pressListeners.clear();
    this._releaseListeners.clear();
    this._endDrag();
    this._clearTray();
    super.preDestroy();
  }

  private _computeSlotHome(slotIndex: number): THREE.Vector3 {
    const cfg = this._requireConfig();
    const tray = cfg.trayPosition;
    const startX = tray.x - ((this._slotCount - 1) * cfg.traySlotSpacing) / 2;
    return new THREE.Vector3(startX + slotIndex * cfg.traySlotSpacing, tray.y, tray.z);
  }

  private _endDrag(): void {
    this._draggedSlot = null;
    this._activePointerId = null;
  }

  private _updateDragPosition(event: PointerEvent): void {
    if (this._draggedSlot === null || !this._world) return;
    const record = this._slotRecords.get(this._draggedSlot);
    if (!record) return;
    const cfg = this._requireConfig();

    const canvas = this._world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._groundHit);
    if (!hit) return;
    record.group.position.set(this._groundHit.x, cfg.stackLiftHeight, this._groundHit.z);
  }

  private _raycastSlot(event: PointerEvent): number | null {
    if (!this._world) return null;
    const canvas = this._world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const meshes: THREE.Mesh[] = [];
    for (const record of this._slotRecords.values()) meshes.push(...record.pickableMeshes);
    if (meshes.length === 0) return null;
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const data = hits[0]!.object.userData as { slotIndex?: number };
    return typeof data.slotIndex === "number" ? data.slotIndex : null;
  }

  private _getOrCreateBlockMaterial(colorIdx: number): THREE.MeshStandardMaterial {
    const existing = this._blockMaterials[colorIdx];
    if (existing) return existing;
    const cfg = this._requireConfig();
    const palette = cfg.blockColors;
    const hex = palette[colorIdx % palette.length]!;
    const material = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.1, roughness: 0.6 });
    this._blockMaterials[colorIdx] = material;
    return material;
  }

  private _clearTray(): void {
    for (const record of this._slotRecords.values()) record.group.removeFromParent();
    this._slotRecords.clear();
    this._slotCount = 0;
    for (const mat of this._blockMaterials) mat?.dispose();
    this._blockMaterials.length = 0;
    this._blockGeometry?.dispose();
    this._blockGeometry = null;
    this._edgeGeometry?.dispose();
    this._edgeGeometry = null;
    this._edgeMaterial?.dispose();
    this._edgeMaterial = null;
  }

  private _requireConfig(): HexaSortConfig {
    if (!this._config) throw new Error("StacksTrayView is not initialized");
    return this._config;
  }
}
