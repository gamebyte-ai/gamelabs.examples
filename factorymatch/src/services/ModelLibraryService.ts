import * as THREE from "three";

import type { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import type { Kind } from "../constants/Kind.js";

/**
 * Provides the 3D object for each pile/tray shape — and is the project's
 * **asset-integration seam**.
 *
 * Right now it builds simple THREE primitives (placeholders), so the game is fully
 * playable with no art. To ship real models, swap the primitive built in `_build`
 * for a loaded asset (e.g. an `FBXLoader` model + albedo texture — see this file's
 * git history for the previous model-loading implementation) and turn `load` into
 * the real async asset load. The rest of the app is unaffected by that swap:
 * `main.ts` awaits `load`, `PileView` calls `make`, teardown calls `dispose`.
 *
 * Each kind gets ONE prototype (geometry + material); `make` hands out cheap clones
 * that share those resources (flagged `userData.shared` so the view's per-clone
 * disposer leaves them alone). The shared resources are freed by `dispose()` at app
 * teardown. Primitives are sized to the kind's box collider so the visible shape
 * matches the body the simulation uses.
 */
export class ModelLibraryService {
  private readonly _proto = new Map<Kind, THREE.Object3D>();

  public constructor(private readonly _config: FactoryMatchConfig) {}

  /** Build one primitive prototype per kind. Async to match the asset-loading seam
   * it stands in for (real model loading would await here). */
  public async load(): Promise<void> {
    for (const kind of Object.keys(this._config.kinds) as Kind[]) this._proto.set(kind, this._build(kind));
  }

  /** A fresh clone of the kind's prototype (geometry + material shared). */
  public make(kind: Kind): THREE.Object3D {
    const proto = this._proto.get(kind);
    if (!proto) throw new Error(`ModelLibraryService: kind "${kind}" was not loaded`);
    return proto.clone(true);
  }

  /** Release the shared prototype resources (geometry, materials). The view skips
   * these on per-clone dispose, so they must be freed here. */
  public dispose(): void {
    for (const proto of this._proto.values()) {
      proto.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
    this._proto.clear();
  }

  /** Prototype = an identity outer group wrapping the primitive mesh, so gameplay
   * tweens drive the group's scale/rotation/position without fighting any baked-in
   * transform (mirrors how loaded models were wrapped). */
  private _build(kind: Kind): THREE.Object3D {
    const mesh = new THREE.Mesh(this._geometry(kind), this._material(kind));
    const outer = new THREE.Group();
    outer.add(mesh);
    this._markShared(outer);
    return outer;
  }

  /** A distinct primitive per kind, sized to fit the kind's box collider (full
   * extents) so the visible shape matches the physics body. Replace per kind when
   * real models are integrated. */
  private _geometry(kind: Kind): THREE.BufferGeometry {
    const c = this._config.kinds[kind].collider;
    switch (kind) {
      case "sphere":
        return new THREE.SphereGeometry(Math.min(c.width, c.height, c.depth) / 2, 24, 16);
      case "cylinder":
        return new THREE.CylinderGeometry(c.width / 2, c.width / 2, c.height, 24);
      case "cuboid": // rectangular prism
        return new THREE.BoxGeometry(c.width, c.height * 0.7, c.depth * 0.55);
      case "pyramid": // square pyramid (4-sided cone, base down)
        return new THREE.ConeGeometry(c.width / 2, c.height, 4);
      case "cube":
      default:
        return new THREE.BoxGeometry(c.width, c.height, c.depth);
    }
  }

  /** Lit material tinted with the kind's config colour (the World base lights the
   * scene with ambient + directional light). */
  private _material(kind: Kind): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: this._config.kinds[kind].color, roughness: 0.55, metalness: 0.1 });
  }

  /** Tag the prototype's geometry + material so the view's per-clone disposer skips
   * them — they're shared across all clones and freed by `dispose()`. */
  private _markShared(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.userData.shared = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData.shared = true;
    });
  }
}
