import * as THREE from "three";
import { BubbleGridLayout } from "../utilities/BubbleGridLayout";

/**
 * Owns the four clipping planes that mask bubble visuals to the
 * play area's rectangle. Held as a viewDiContainer singleton so
 * every bubble-drawing sub-view can apply the SAME plane instances
 * to its materials — updating layout extents in one place reflects
 * across all materials in the next render frame.
 *
 * Plane orientation (Three.js convention: fragment kept where the
 * signed distance to the plane is ≥ 0):
 *
 *   top:    n = (0, -1, 0), c = halfAreaHeight  → keeps y ≤ halfAreaHeight
 *   bottom: n = (0,  1, 0), c = halfAreaHeight  → keeps y ≥ -halfAreaHeight
 *   left:   n = (1,  0, 0), c = halfAreaWidth   → keeps x ≥ -halfAreaWidth
 *   right:  n = (-1, 0, 0), c = halfAreaWidth   → keeps x ≤ halfAreaWidth
 *
 * Requires `renderer.localClippingEnabled = true` (set in
 * `GameAreaView.postInitialize`).
 */
export class PlayAreaClipping {
  private readonly _planes: THREE.Plane[];

  public constructor(layout: BubbleGridLayout) {
    this._planes = [
      new THREE.Plane(new THREE.Vector3(0, -1, 0), layout.halfAreaHeight),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), layout.halfAreaHeight),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), layout.halfAreaWidth),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), layout.halfAreaWidth),
    ];
  }

  public get planes(): THREE.Plane[] {
    return this._planes;
  }

  /**
   * Recompute plane constants from the current layout. Called when
   * the layout's wide-row column count changes (per-level width
   * override). Plane normals stay the same — only the half-extents
   * shift, so we just patch the constants in place.
   */
  public refreshFromLayout(layout: BubbleGridLayout): void {
    this._planes[0]!.constant = layout.halfAreaHeight;
    this._planes[1]!.constant = layout.halfAreaHeight;
    this._planes[2]!.constant = layout.halfAreaWidth;
    this._planes[3]!.constant = layout.halfAreaWidth;
  }
}
