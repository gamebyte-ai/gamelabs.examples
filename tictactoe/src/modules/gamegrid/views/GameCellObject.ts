import * as THREE from "three";
import { GridCellObject, GridCellObjectOptions, POINTER_INPUT_LAYER } from "@gamebyte/gamelabsjs";
import type { IAssetManager, IWorldPointerInput, IPointerInputHandler, RectGridPreset } from "@gamebyte/gamelabsjs";
import type { IGridObjectListener } from "@gamebyte/gamelabsjs";
import { TicTacToeAssetIds } from "../../../TicTacToeAssetIds";

export class GameCellObject extends GridCellObject implements IPointerInputHandler {
  private static readonly COLLIDER_THICKNESS = 0.2;
  private static readonly QUAD_THICKNESS = 0.01;

  public declare readonly preset: RectGridPreset;

  public constructor(options: GridCellObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const texture = this._assetManager?.getAsset<THREE.Texture>(TicTacToeAssetIds.Cell);
    const material = texture
      ? new THREE.MeshBasicMaterial({ map: texture, transparent: false })
      : new THREE.MeshBasicMaterial({ color: 0x334155 });
    const geom = new THREE.PlaneGeometry(this.preset.columnSize * 0.9, this.preset.rowSize * 0.9);
    const mesh = new THREE.Mesh(geom, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -GameCellObject.QUAD_THICKNESS * 0.5, 0);
    this.add(mesh);
  }

  protected override createCollider(): void {
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const geom = new THREE.BoxGeometry(this.preset.columnSize * 0.9, GameCellObject.COLLIDER_THICKNESS, this.preset.rowSize * 0.9);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(0, GameCellObject.COLLIDER_THICKNESS * 0.5, 0);
    mesh.layers.enable(POINTER_INPUT_LAYER);
    this.add(mesh);
  }

  public onPointerDown(_event: PointerEvent, _onThisObject: boolean): void {
    if (_onThisObject){
      this._pointerListener.onGridCellPointerDown(this.gridId, this.col, this.row, _event);
    }
  }

  public onPointerMove(_event: PointerEvent, _onThisObject: boolean): void {}

  public onPointerUp(_event: PointerEvent, _onThisObject: boolean): void {}

  public onPointerCancel(_event: PointerEvent): void {}
}
