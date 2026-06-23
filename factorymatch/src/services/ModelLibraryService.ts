import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import type { FactoryMatchConfig } from "../FactoryMatchConfig.js";
import type { Kind } from "../models/IGameModel.js";

import diceUrl from "../../assets/SM_Toy_Dice_01.fbx?url";
import billardUrl from "../../assets/BillardBall_8.fbx?url";
import guitarUrl from "../../assets/SM_Guitar_01.fbx?url";
import radioUrl from "../../assets/SM_Radio_01.fbx?url";
import gascanUrl from "../../assets/SM_GasCan_01.fbx?url";

import radioTexUrl from "../../assets/SM_Radio_01_Turquoise_Albedo.png?url";
import billardTexUrl from "../../assets/BillardBall_8.png?url";

const URLS: Record<Kind, string> = {
  dice: diceUrl,
  billardball: billardUrl,
  guitar: guitarUrl,
  radio: radioUrl,
  gascan: gascanUrl,
};

/** Albedo (base-colour) texture per kind. Kinds without one are tinted with their
 * config colour instead (see load). Add more as their texture files land. */
const TEXTURES: Partial<Record<Kind, string>> = {
  radio: radioTexUrl,
  billardball: billardTexUrl,
};

/**
 * External-boundary service: loads the FBX model files (+ their albedo textures)
 * once, normalises each (recentred + uniform-scaled per config), and hands out
 * cheap clones. Clones share geometry + materials with the prototype, flagged
 * `userData.shared` so the view's per-clone disposer leaves them alone; the shared
 * resources are released by `dispose()` at app teardown.
 *
 * Loading is all-or-nothing — a failed load rejects and propagates to the
 * bootstrap caller (no fallback/limp-along), matching the project's
 * initialization philosophy. The engine has no FBX `AssetType`, so this loads via
 * three's `FBXLoader` directly rather than through `AssetManager`.
 */
export class ModelLibraryService {
  private readonly _proto = new Map<Kind, THREE.Object3D>();

  public constructor(private readonly _config: FactoryMatchConfig) {}

  public async load(): Promise<void> {
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const kinds = Object.keys(URLS) as Kind[];
    await Promise.all(
      kinds.map(async (kind) => {
        const fbx = await loader.loadAsync(URLS[kind]);
        const proto = this._normalize(fbx, this._target(kind));
        const texUrl = TEXTURES[kind];
        if (texUrl) {
          // Real albedo texture → show it true-colour (no tint).
          const tex = await texLoader.loadAsync(texUrl);
          tex.colorSpace = THREE.SRGBColorSpace;
          this._applyTexture(proto, tex);
        } else {
          // No texture yet → tint with the config colour so kinds stay distinct.
          this._tint(proto, this._config.kinds[kind].color);
        }
        this._proto.set(kind, proto);
      }),
    );
  }

  /** A fresh clone of the loaded prototype (geometry + materials shared). */
  public make(kind: Kind): THREE.Object3D {
    const proto = this._proto.get(kind);
    if (!proto) throw new Error(`ModelLibraryService: kind "${kind}" was not loaded`);
    return proto.clone(true);
  }

  /** Release the shared prototype resources (geometry, materials, textures). The
   * view skips these on per-clone dispose, so they must be freed here. */
  public dispose(): void {
    for (const proto of this._proto.values()) {
      proto.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      });
    }
    this._proto.clear();
  }

  /** Per-kind target size: the shared `fit` baseline times this kind's `scale`. */
  private _target(kind: Kind): number {
    return this._config.models.fit * this._config.models.scale[kind];
  }

  /** Recentre on the bounding-box centre and uniform-scale so the largest extent
   * equals `target`. The fit-scale lives on an inner group; the returned outer
   * group keeps scale 1 so gameplay tweens can drive its scale without fighting it. */
  private _normalize(src: THREE.Object3D, target: number): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fit = target / (Math.max(size.x, size.y, size.z) || 1);

    src.position.sub(center); // bbox centre → origin (in the model's own units)
    const inner = new THREE.Group();
    inner.add(src);
    inner.scale.setScalar(fit);

    const outer = new THREE.Group();
    outer.add(inner);
    this._markShared(outer);
    return outer;
  }

  /** Assign an albedo map to every material and reset its colour to white so the
   * texture shows true-colour (not multiplied by a tint). Shared across clones. */
  private _applyTexture(root: THREE.Object3D, tex: THREE.Texture): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        mat.map = tex;
        mat.color?.set(0xffffff);
        mat.needsUpdate = true;
      }
    });
  }

  /** Set the diffuse colour on every material (FBX materials expose `.color`).
   * Tints the whole kind at once since clones share these materials. */
  private _tint(root: THREE.Object3D, color: number): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as THREE.Material & { color?: THREE.Color }).color?.set(color);
      }
    });
  }

  /** Tag every mesh's geometry + materials so the per-clone disposer skips them —
   * they are shared across all clones and the prototype. */
  private _markShared(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.userData.shared = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData.shared = true;
    });
  }
}
