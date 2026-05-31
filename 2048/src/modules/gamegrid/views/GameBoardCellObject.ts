import * as THREE from "three";
import type { IAssetManager, IInputManager, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridCellObject, GridCellObjectOptions, type IGridObjectListener } from "@gamebyte/gamelabsjs";

/**
 * Static board cell — non-interactive (2048 input is keyboard / swipe-driven, not per-cell).
 */
export class GameBoardCellObject extends GridCellObject {
  private static readonly PLANE_Y = 0.005;

  public declare readonly preset: RectGridPreset;

  public constructor(options: GridCellObjectOptions, pointerListener: IGridObjectListener, inputManager: IInputManager | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const material = new THREE.MeshBasicMaterial({ color: 0x3c3a32 });
    const geom = new THREE.PlaneGeometry(this.preset.columnSize * 0.92, this.preset.rowSize * 0.92);
    const mesh = new THREE.Mesh(geom, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, GameBoardCellObject.PLANE_Y, 0);
    this.add(mesh);
  }

  protected override createCollider(): void {}
}
