import * as THREE from "three";
import type { IAssetManager, IInputManager, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions";
import { PieceMeshBuilder } from "./PieceMeshBuilder";

/**
 * Visual for one item on a board — N coloured blocks laid out
 * according to `options.cells`, centred on the host cell.
 *
 * The controller decides what to render at each spot:
 * - tray items get the full piece shape, so the slot shows a
 *   recognisable preview of the whole piece;
 * - grid items get a single-cell layout (`[[0, 0]]`), so each
 *   item occupies exactly one grid cell.
 *
 * Rendering is fully generic: any list of `(col, row)` offsets
 * renders correctly. Adding a new piece type to the catalog adds
 * no new rendering code.
 */
export class GameBoardItemObject extends GridItemObject {
  public declare readonly preset: RectGridPreset;

  public constructor(
    options: GameBoardItemObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IInputManager | null,
    assetManager: IAssetManager | null,
  ) {
    super(options, pointerListener, inputManager, assetManager);
    // The drag pipeline on the world view raycasts piece meshes and
    // needs a way back to the originating model item; stash it on
    // `userData` so the view can read it without going through DI.
    this.userData["modelItem"] = options.modelItem;
  }

  protected override createVisual(): void {
    const options = this._options as GameBoardItemObjectOptions;
    PieceMeshBuilder.appendBlocks(this, options.cells, options.blockSize, options.color, {
      opacity: 1,
      y: PieceMeshBuilder.DEFAULT_BLOCK_Y,
    });
  }

  protected override createCollider(): void {
    // No collider — pointer interaction lives on the world view, which
    // raycasts piece meshes directly (see GameBoardsView).
  }

  /**
   * Pickable meshes for tray-piece raycasting. The drag pipeline on
   * `GameBoardsView` reads this to know which meshes belong to which
   * item — selecting any block of a tray piece picks up the whole
   * piece. Returned meshes are the children added in `createVisual`.
   */
  public get pickableMeshes(): THREE.Object3D[] {
    return this.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true);
  }

  /**
   * Toggle the faded visual used for unplaceable tray pieces. When
   * `faded` is true, every block mesh switches to a transparent
   * material at `fadedOpacity`; when false, the material returns to
   * fully opaque. `needsUpdate` is set on each toggle so the
   * renderer rebuilds the transparent-vs-opaque pass assignment.
   */
  public setFaded(faded: boolean, fadedOpacity: number): void {
    for (const child of this.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const mat = child.material;
      if (!(mat instanceof THREE.MeshBasicMaterial)) continue;
      mat.transparent = faded;
      mat.opacity = faded ? fadedOpacity : 1;
      mat.needsUpdate = true;
    }
  }
}
