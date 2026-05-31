import * as THREE from "three";
import { WorldViewBase, LogTypes, POINTER_INPUT_LAYER, type IPointerInputHandler, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { ICubeView } from "./ICubeView";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HelloWorldAssetIds } from "../HelloWorldAssetIds";

export class CubeView extends WorldViewBase implements ICubeView, IPointerInputHandler {
  private _model: THREE.Object3D | null = null;
  private _dragState = { isDragging: false, lastX: 0, lastY: 0 };
  private readonly _dragListeners = new Set<(dx: number, dy: number) => void>();

  public onPointerDown(event: PointerEvent, _onThisObject: boolean): void {
    if (event.button !== 0) return;
    this._dragState.isDragging = true;
    this._dragState.lastX = event.clientX;
    this._dragState.lastY = event.clientY;
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }

  public onPointerMove(event: PointerEvent, _onThisObject: boolean): void {
    if (!this._dragState.isDragging) return;
    const dx = (event.clientX - this._dragState.lastX) * 0.005;
    const dy = (event.clientY - this._dragState.lastY) * 0.005;
    this._dragState.lastX = event.clientX;
    this._dragState.lastY = event.clientY;
    for (const cb of this._dragListeners) cb(dx, dy);
  }

  public onPointerUp(event: PointerEvent, _onThisObject: boolean): void {
    this._dragState.isDragging = false;
  }

  public onPointerCancel(event: PointerEvent): void {
    if (event.button !== 0) return;
    this._dragState.isDragging = false;
  }

  public override postInitialize(): void {
    super.postInitialize();
    const gltf = this.assetLoader.getAsset<GLTF>(HelloWorldAssetIds.Cube);
    if (!gltf) {
      const msg = `CubeView: missing asset: ${HelloWorldAssetIds.Cube}`;
      this.logger.log(msg, LogTypes.Error);
      throw new Error(msg);
    }

    this._model = gltf.scene.clone(true);
    this._model.traverse((obj) => obj.layers.enable(POINTER_INPUT_LAYER));
    this.add(this._model);
  }

  rotate(dx: number, dy: number): void {
    if (!this._model) return;
    this._model.rotation.x += dx;
    this._model.rotation.y += dy;
  }

  setColor(hex: number): void {
    if (!this._model) return;

    this._model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const m of material) this.trySetMaterialColor(m, hex);
      } else {
        this.trySetMaterialColor(material, hex);
      }
    });
  }

  onDrag(cb: (dx: number, dy: number) => void): Unsubscribe {
    this._dragListeners.add(cb);
    return () => { this._dragListeners.delete(cb); };
  }

  public preDestroy(): void {
    this._dragListeners.clear();
    this._model = null;
  }

  private trySetMaterialColor(material: THREE.Material, hex: number): void {
    const maybeColor = (material as unknown as { color?: THREE.Color }).color;
    if (!maybeColor) return;
    maybeColor.set(hex);
  }
}
