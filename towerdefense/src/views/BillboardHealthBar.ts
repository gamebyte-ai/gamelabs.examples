import * as THREE from "three";

/**
 * Camera-facing health bar built from a single THREE.Group.
 *
 * Internally uses two sprites (background + foreground) but exposes itself
 * as one node so callers add and update exactly one reference per entity.
 *
 * `renderOrder` + `depthWrite: false` + `depthTest: false` prevent the two
 * overlapping transparent sprites from z-fighting as the camera rotates.
 */
export class BillboardHealthBar extends THREE.Group {
  private readonly _bg: THREE.Sprite;
  private readonly _fg: THREE.Sprite;
  private readonly _width: number;

  public constructor(
    width: number,
    height: number,
    bgColor = 0x440000,
    fgColor = 0x00cc00,
  ) {
    super();
    this._width = width;

    this._bg = new THREE.Sprite(new THREE.SpriteMaterial({
      color: bgColor,
      depthTest: false,
      depthWrite: false,
    }));
    this._bg.scale.set(width, height, 1);
    this._bg.renderOrder = 998;
    this.add(this._bg);

    this._fg = new THREE.Sprite(new THREE.SpriteMaterial({
      color: fgColor,
      depthTest: false,
      depthWrite: false,
    }));
    this._fg.scale.set(width, height, 1);
    this._fg.renderOrder = 999;
    this.add(this._fg);
  }

  /**
   * Set fill ratio in [0, 1]. Foreground shrinks from the right.
   *
   * Both sprites share the same 3D position, so they project to the same
   * screen anchor regardless of camera angle. The left-aligned shrink is
   * achieved by adjusting the foreground sprite's `center.x` (anchor on
   * the quad) rather than its 3D position — that's what previously caused
   * the bars to drift when the camera rotated, because a local-X offset
   * does not correspond to "screen-space left" once the parent is viewed
   * from a different angle.
   *
   * Math: BG (center 0.5, scale w) has left edge at position − 0.5·w.
   * FG (center 0.5/r, scale w·r) also has left edge at position − 0.5·w
   * and right edge at position + (w·r − 0.5·w), so it shrinks from the
   * right while keeping its left edge locked to BG's.
   */
  public setRatio(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this._fg.scale.x = this._width * r;
    this._fg.center.x = r > 0 ? 0.5 / r : 0.5;
  }

  public dispose(): void {
    (this._bg.material as THREE.SpriteMaterial).dispose();
    (this._fg.material as THREE.SpriteMaterial).dispose();
  }
}
