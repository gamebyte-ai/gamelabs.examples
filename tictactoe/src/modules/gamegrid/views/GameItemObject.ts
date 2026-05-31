import * as THREE from "three";
import gsap from "gsap";
import type { IGridObjectListener, IInputManager, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject } from "@gamebyte/gamelabsjs";
import { Team } from "../../../constants/Team.js";
import { TicTacToeAssetIds } from "../../../TicTacToeAssetIds.js";
import type { GameItemObjectOptions } from "./GameItemObjectOptions.js";

export class GameItemObject extends GridItemObject {
  private static readonly TWEEN_DURATION = 0.25;

  public declare readonly preset: RectGridPreset;

  public constructor(options: GameItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IInputManager | null, assetManager?: import("@gamebyte/gamelabsjs").IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  protected override createVisual(): void {
    const team = (this._options as GameItemObjectOptions).team;
    const assetId = team === Team.X ? TicTacToeAssetIds.ItemX : TicTacToeAssetIds.ItemO;
    const texture = this._assetManager?.getAsset<THREE.Texture>(assetId);
    const material = texture
      ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: team === Team.X ? 0x3b82f6 : 0xef4444, side: THREE.DoubleSide });
    material.transparent = true;
    material.opacity = 0;
    const size = Math.min(this.preset.columnSize, this.preset.rowSize) * 0.8;
    const geom = new THREE.PlaneGeometry(size, size);
    const mesh = new THREE.Mesh(geom, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    this.add(mesh);
    this.scale.set(1.3, 1.3, 1.3);
    gsap.to(this.scale, { x: 1, y: 1, z: 1, duration: GameItemObject.TWEEN_DURATION, ease: "power2.out" });
    gsap.to(material, { opacity: 1, duration: GameItemObject.TWEEN_DURATION, ease: "power2.out" });
  }
}
