import * as THREE from "three";
import type { IAssetManager, IWorldPointerInput, IPointerInputHandler, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridCellObject, GridCellObjectOptions, POINTER_INPUT_LAYER, type IGridObjectListener } from "@gamebyte/gamelabsjs";

export class GameBoardCellObject extends GridCellObject implements IPointerInputHandler {
  private static readonly COLLIDER_THICKNESS = 0.22;

  public declare readonly preset: RectGridPreset;

  public constructor(options: GridCellObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  /**
   * Cells are deliberately not drawn — the board reads as the scene backdrop
   * with a single outline around the grid (see `GameBoardsView`). The collider
   * below is unaffected, so cell picking still works.
   */
  protected override createVisual(): void {}

  protected override createCollider(): void {
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const geom = new THREE.BoxGeometry(this.preset.columnSize * 0.92, GameBoardCellObject.COLLIDER_THICKNESS, this.preset.rowSize * 0.92);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(0, GameBoardCellObject.COLLIDER_THICKNESS * 0.5, 0);
    mesh.layers.enable(POINTER_INPUT_LAYER);
    this.add(mesh);
  }

  public onPointerDown(event: PointerEvent, onThisObject: boolean): void {
    if (onThisObject) this._pointerListener.onGridCellPointerDown(this.gridId, this.col, this.row, event);
  }

  public onPointerMove(_event: PointerEvent, _onThisObject: boolean): void {}

  public onPointerUp(_event: PointerEvent, _onThisObject: boolean): void {}

  public onPointerCancel(_event: PointerEvent): void {}
}
