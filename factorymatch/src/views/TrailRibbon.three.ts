import * as THREE from "three";
import gsap from "gsap";

/** Render order for the trail strip (depth-tested; layering follows real depth). */
export const TRAIL_RENDER_ORDER = 6;

/**
 * A continuous camera-facing ribbon that follows a moving point — a classic comet
 * trail. `push(p)` feeds the head position each frame; the ribbon is the last
 * `maxPoints` positions, rebuilt as one strip whose width offsets are billboarded
 * against the camera so it always reads as a flat streak. Fixed (uniform) colour
 * and opacity — no flicker; `fadeOut` dissolves the whole strip after the flight.
 */
export class TrailRibbon {
  private readonly _points: THREE.Vector3[] = [];
  private readonly _maxPoints: number;
  private readonly _halfWidth: number;
  private readonly _camDir: THREE.Vector3;
  private readonly _positions: Float32Array;
  private readonly _geometry = new THREE.BufferGeometry();
  private readonly _material: THREE.MeshBasicMaterial;
  private readonly _mesh: THREE.Mesh;
  private readonly _seg = new THREE.Vector3();
  private readonly _side = new THREE.Vector3();

  public constructor(parent: THREE.Object3D, color: number, width: number, opacity: number, maxPoints: number, camDir: THREE.Vector3) {
    this._maxPoints = Math.max(2, Math.floor(maxPoints));
    this._halfWidth = width / 2;
    this._camDir = camDir.clone().normalize();

    this._positions = new Float32Array(this._maxPoints * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < this._maxPoints - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this._geometry.setAttribute("position", new THREE.BufferAttribute(this._positions, 3));
    this._geometry.setIndex(indices);

    this._material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      // depthTest stays on: the trail is occluded by the flying item (its front
      // faces are nearer than the trail's head) but sits in front of the lower
      // pile items it passes over — correct layering without forcing it on top.
    });
    this._mesh = new THREE.Mesh(this._geometry, this._material);
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder = TRAIL_RENDER_ORDER;
    this._mesh.raycast = (): void => {};
    parent.add(this._mesh);
  }

  /** Feed the current head position; drops the oldest once past `maxPoints`. */
  public push(p: THREE.Vector3): void {
    this._points.unshift(p.clone());
    while (this._points.length > this._maxPoints) this._points.pop();
    this._rebuild();
  }

  /** After the head stops, the tail (oldest end) catches up to it: drop points
   * from the tail over `duration` so the ribbon vanishes from where it started
   * toward the head, rather than fading out as a whole. */
  public dissolve(duration: number, onDone: () => void): void {
    const state = { keep: this._points.length };
    gsap.to(state, {
      keep: 0,
      duration,
      ease: "none",
      onUpdate: () => {
        const keep = Math.max(0, Math.round(state.keep));
        while (this._points.length > keep) this._points.pop(); // pop() drops the oldest (tail)
        this._rebuild();
      },
      onComplete: onDone,
    });
  }

  public dispose(): void {
    gsap.killTweensOf(this._material);
    this._mesh.removeFromParent();
    this._geometry.dispose();
    this._material.dispose();
  }

  /** Rebuild the two offset vertices per cross-section. Unfilled sections collapse
   * onto the oldest point (degenerate → invisible) until the trail fills up. */
  private _rebuild(): void {
    const last = this._points.length - 1;
    if (last < 0) {
      this._mesh.visible = false; // nothing left to draw
      return;
    }
    for (let i = 0; i < this._maxPoints; i++) {
      const p = this._points[Math.min(i, last)]!;
      const ahead = this._points[Math.max(0, Math.min(i, last) - 1)]!;
      this._seg.subVectors(ahead, p);
      if (this._seg.lengthSq() < 1e-8) this._seg.set(1, 0, 0);
      this._side.crossVectors(this._seg, this._camDir).normalize().multiplyScalar(this._halfWidth);
      const o = i * 6;
      this._positions[o] = p.x + this._side.x;
      this._positions[o + 1] = p.y + this._side.y;
      this._positions[o + 2] = p.z + this._side.z;
      this._positions[o + 3] = p.x - this._side.x;
      this._positions[o + 4] = p.y - this._side.y;
      this._positions[o + 5] = p.z - this._side.z;
    }
    (this._geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    this._geometry.computeBoundingSphere();
  }
}
