import * as THREE from "three";
import { GridsView } from "@gamebyte/gamelabsjs";

export class GameGridsView extends GridsView {
  private _cellPointerDownHandler: ((gridId: number, col: number, row: number) => void) | null = null;

  public setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number) => void) | null): void {
    this._cellPointerDownHandler = handler;
  }

  public override postInitialize(): void {
    super.postInitialize();

    const scene = this.parent;
    if (scene instanceof THREE.Scene) {
      scene.fog = new THREE.Fog(0x0b0f14, 15, 50);
    }
  }

  public override onGridCellPointerDown(gridId: number, col: number, row: number, _event: PointerEvent): void {
    this._cellPointerDownHandler?.(gridId, col, row);
  }
}
