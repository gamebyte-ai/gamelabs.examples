import * as THREE from "three";
import gsap from "gsap";
import { GridsView, type RectGridPreset } from "@gamebyte/gamelabsjs";
import { TowerDefenseConfig } from "../../../TowerDefenseConfig.js";
import type { TowerTypeId } from "../../../constants/TowerTypeDef.js";
import { GameBoardCellObject } from "./GameBoardCellObject.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import type { IGameBoardsView } from "./IGameBoardsView.js";

type CellPointerDownHandler = (gridId: number, col: number, row: number) => void;
type CellHoverHandler = (col: number, row: number, hovered: boolean) => void;

/**
 * 3D world view for the tower-defense board.
 * Delegates cell creation to {@link GameBoardObjectCreator} (registered via the binding).
 */
export class GameBoardsView extends GridsView implements IGameBoardsView {
  private _cellPointerDownHandler: CellPointerDownHandler | null = null;
  private _ghostMesh: THREE.Group | null = null;
  private _ghostMaterial: THREE.MeshStandardMaterial | null = null;
  private _rangeRing: THREE.Mesh | null = null;
  /** Every barrel we've ever tweened — kill all pending tweens on teardown. */
  private readonly _animatedBarrels = new Set<THREE.Object3D>();

  public setCellPointerDownHandler(handler: CellPointerDownHandler | null): void {
    this._cellPointerDownHandler = handler;
  }

  public setCellHoverHandler(handler: CellHoverHandler | null): void {
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;
    for (let col = 0; col < gridObj.columnCount; col++) {
      for (let row = 0; row < gridObj.rowCount; row++) {
        const cell = gridObj.getCell(col, row) as GameBoardCellObject | undefined;
        cell?.setHoverCallback(handler);
      }
    }
  }

  public refreshAllCells(): void {
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;
    for (let col = 0; col < gridObj.columnCount; col++) {
      for (let row = 0; row < gridObj.rowCount; row++) {
        const cell = gridObj.getCell(col, row) as GameBoardCellObject | undefined;
        cell?.updateCellType();
      }
    }
  }

  // ── Ghost tower preview ───────────────────────────────────────────────

  public showGhost(towerType: TowerTypeId): void {
    this.removeGhost();
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;

    this._ghostMesh = GameBoardItemObject.createGhostMesh(towerType, gridObj.preset as RectGridPreset);
    this._ghostMesh.visible = false;

    // Grab the material reference for tinting valid/invalid
    this._ghostMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        this._ghostMaterial = child.material;
      }
    });

    gridObj.add(this._ghostMesh);
  }

  public updateGhostPosition(col: number, row: number, valid: boolean): void {
    if (!this._ghostMesh) return;
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;

    const pos = gridObj.preset.getCellPosition(col, row);
    this._ghostMesh.position.set(pos.x, pos.y, pos.z);
    this._ghostMesh.visible = true;

    if (this._ghostMaterial) {
      this._ghostMaterial.color.set(valid ? 0x44cc66 : 0xcc4444);
      this._ghostMaterial.opacity = valid ? 0.45 : 0.3;
    }
  }

  public hideGhost(): void {
    if (this._ghostMesh) this._ghostMesh.visible = false;
  }

  public removeGhost(): void {
    if (this._ghostMesh) {
      this._ghostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      this._ghostMesh.removeFromParent();
      this._ghostMesh = null;
      this._ghostMaterial = null;
    }
  }

  // ── Range indicator ────────────────────────────────────────────────────

  public showRangeIndicator(col: number, row: number, range: number, color: number): void {
    this.hideRangeIndicator();
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;

    const geom = new THREE.RingGeometry(range - 0.04, range + 0.04, 64);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geom, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 100;

    const pos = gridObj.preset.getCellPosition(col, row);
    ring.position.set(pos.x, 0.25, pos.z);

    gridObj.add(ring);
    this._rangeRing = ring;
  }

  public hideRangeIndicator(): void {
    if (this._rangeRing) {
      this._rangeRing.geometry.dispose();
      (this._rangeRing.material as THREE.Material).dispose();
      this._rangeRing.removeFromParent();
      this._rangeRing = null;
    }
  }

  // ── Pointer events ────────────────────────────────────────────────────

  // ── Cannon barrel recoil animation ─────────────────────────────────

  public animateCannonFire(col: number, row: number, targetX: number, targetZ: number): void {
    const gridObj = this.getGridObject(TowerDefenseConfig.GRID_ID);
    if (!gridObj) return;
    const cell = gridObj.getCell(col, row);
    const towerItem = cell?.item;
    if (!towerItem) return;

    // Aim the whole tower toward the target.
    const dx = targetX - col;
    const dz = targetZ - row;
    towerItem.rotation.y = Math.atan2(dx, dz);

    // Find the barrel by userData tag.
    let barrelRef: THREE.Object3D | undefined;
    towerItem.traverse((child) => { if (child.userData?.role === "barrel") barrelRef = child; });
    if (!barrelRef) return;
    const barrel = barrelRef;

    const restZ = (barrel.userData as { restZ: number }).restZ;
    const recoilZ = restZ - 0.1;

    // Kill any in-flight recoil on this barrel so firing again mid-recoil
    // doesn't stack conflicting tweens.
    gsap.killTweensOf(barrel.position);
    this._animatedBarrels.add(barrel);

    // Kick back → return to rest
    gsap.to(barrel.position, { z: recoilZ, duration: 0.06, ease: "power2.out", onComplete: () => {
      gsap.to(barrel.position, { z: restZ, duration: 0.2, ease: "power2.inOut" });
    }});
  }

  /** Stop all cannon tweens. Called on level teardown + view destroy. */
  public killCannonTweens(): void {
    for (const barrel of this._animatedBarrels) gsap.killTweensOf(barrel.position);
    this._animatedBarrels.clear();
  }

  // ── Pointer events ────────────────────────────────────────────────────

  public override onGridCellPointerDown(gridId: number, col: number, row: number, _event: PointerEvent): void {
    this._cellPointerDownHandler?.(gridId, col, row);
  }

  public override preDestroy(): void {
    this.killCannonTweens();
    this.removeGhost();
    this.hideRangeIndicator();
    this._cellPointerDownHandler = null;
    super.preDestroy();
  }
}
