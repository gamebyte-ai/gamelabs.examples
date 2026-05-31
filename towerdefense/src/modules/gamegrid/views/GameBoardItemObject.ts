import * as THREE from "three";
import { GridItemObject, type RectGridPreset } from "@gamebyte/gamelabsjs";
import { TowerTypeId, TOWER_TYPES } from "../../../constants/TowerTypeDef.js";
import { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

/**
 * Sci-fi themed tower models. Each type has a distinct silhouette and
 * colour palette. The placement ghost uses the exact same builder with
 * a transparent material override.
 */
export class GameBoardItemObject extends GridItemObject {
  public declare readonly preset: RectGridPreset;

  protected override createVisual(): void {
    const opts = this._options as GameBoardItemObjectOptions;
    GameBoardItemObject._build(this, opts.towerType, this.preset, false);
  }

  public static createGhostMesh(towerType: TowerTypeId, preset: RectGridPreset): THREE.Group {
    const group = new THREE.Group();
    GameBoardItemObject._build(group, towerType, preset, true);
    return group;
  }

  // ── Central dispatcher ────────────────────────────────────────────────

  private static _build(parent: THREE.Object3D, type: TowerTypeId, preset: RectGridPreset, ghost: boolean): void {
    const typeDef = TOWER_TYPES.get(type);
    if (!typeDef) return;
    const s = Math.min(preset.columnSize, preset.rowSize) * 0.75;
    const y0 = 0.14;
    const base = new THREE.MeshStandardMaterial({ color: typeDef.color, metalness: 0.35, roughness: 0.55 });
    const accent = new THREE.MeshStandardMaterial({ color: GameBoardItemObject._brighten(typeDef.color, 0.3), metalness: 0.5, roughness: 0.4 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.6, roughness: 0.35 });
    if (ghost) { for (const m of [base, accent, metal]) { m.transparent = true; m.opacity = 0.4; } }

    switch (type) {
      case TowerTypeId.Archer: GameBoardItemObject._buildArcher(parent, s, y0, base, accent, metal); break;
      case TowerTypeId.Cannon: GameBoardItemObject._buildCannon(parent, s, y0, base, accent, metal); break;
      case TowerTypeId.Tesla:  GameBoardItemObject._buildTesla(parent, s, y0, base, accent, metal); break;
      case TowerTypeId.Ice:    GameBoardItemObject._buildIce(parent, s, y0, base, accent, metal); break;
      case TowerTypeId.Laser:  GameBoardItemObject._buildLaser(parent, s, y0, base, accent, metal); break;
    }
  }

  // ── Archer: tall watchtower with pointed spire ────────────────────────

  private static _buildArcher(p: THREE.Object3D, s: number, y0: number, base: THREE.Material, accent: THREE.Material, metal: THREE.Material): void {
    // Pedestal: wider at bottom, narrower at top (CylinderGeometry args: radiusTop, radiusBottom, height)
    const pedestal = GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.30, s * 0.38, 0.16, 8), base, 0, y0 + 0.08, 0);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    // Shaft: tapers upward
    GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.18, s * 0.30, 0.32, 8), metal, 0, y0 + 0.32, 0).castShadow = true;
    // Platform ring: slightly wider than shaft top for an overhang
    GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.26, s * 0.26, 0.04, 8), accent, 0, y0 + 0.50, 0);
    // Crenellation bumps
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      GameBoardItemObject._m(p, new THREE.BoxGeometry(s * 0.08, 0.06, s * 0.06), metal, Math.sin(a) * s * 0.22, y0 + 0.55, Math.cos(a) * s * 0.22);
    }
    // Pointed spire
    GameBoardItemObject._m(p, new THREE.ConeGeometry(s * 0.18, 0.22, 8), accent, 0, y0 + 0.63, 0).castShadow = true;
  }

  // ── Cannon: squat armoured emplacement with barrel ────────────────────

  private static _buildCannon(p: THREE.Object3D, s: number, y0: number, base: THREE.Material, accent: THREE.Material, metal: THREE.Material): void {
    const b = GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.4, s * 0.44, 0.18, 8), base, 0, y0 + 0.09, 0);
    b.castShadow = true; b.receiveShadow = true;
    const band = GameBoardItemObject._m(p, new THREE.TorusGeometry(s * 0.40, 0.015, 4, 16), metal, 0, y0 + 0.14, 0);
    band.rotation.x = Math.PI / 2;
    GameBoardItemObject._m(p, new THREE.SphereGeometry(s * 0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), accent, 0, y0 + 0.18, 0).castShadow = true;
    const barrel = GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.08, s * 0.11, s * 0.55, 8), metal, 0, y0 + 0.26, s * 0.32);
    barrel.rotation.x = Math.PI / 2 - 0.15;
    barrel.castShadow = true;
    barrel.userData = { role: "barrel", restZ: s * 0.32 };
    const muzzle = GameBoardItemObject._m(p, new THREE.TorusGeometry(s * 0.1, 0.015, 4, 8), metal, 0, y0 + 0.3, s * 0.58);
    muzzle.rotation.x = -0.15;
    GameBoardItemObject._m(p, new THREE.BoxGeometry(s * 0.16, s * 0.12, s * 0.14), new THREE.MeshStandardMaterial({ color: 0x6b5533, roughness: 0.8 }), -s * 0.32, y0 + 0.06, -s * 0.1).castShadow = true;
  }

  // ── Tesla: coil tower with glowing orb ────────────────────────────────

  private static _buildTesla(p: THREE.Object3D, s: number, y0: number, base: THREE.Material, _accent: THREE.Material, metal: THREE.Material): void {
    const glow = new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.8 });
    const b = GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.3, s * 0.35, 0.14, 8), base, 0, y0 + 0.07, 0);
    b.castShadow = true; b.receiveShadow = true;
    for (let i = 0; i < 3; i++) {
      const ring = GameBoardItemObject._m(p, new THREE.TorusGeometry(s * (0.22 - i * 0.03), 0.012, 4, 12), metal, 0, y0 + 0.18 + i * 0.09, 0);
      ring.rotation.x = Math.PI / 2;
    }
    GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.04, s * 0.05, 0.35, 6), metal, 0, y0 + 0.32, 0).castShadow = true;
    GameBoardItemObject._m(p, new THREE.SphereGeometry(s * 0.14, 10, 8), glow, 0, y0 + 0.54, 0).castShadow = true;
  }

  // ── Ice: crystal formation with frost glow ────────────────────────────

  private static _buildIce(p: THREE.Object3D, s: number, y0: number, base: THREE.Material, _accent: THREE.Material, _metal: THREE.Material): void {
    const ice = new THREE.MeshStandardMaterial({ color: 0xaaddff, metalness: 0.15, roughness: 0.2 });
    const frost = new THREE.MeshStandardMaterial({ color: 0x88eeff, emissive: 0x44aacc, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 });
    // Rocky base
    const b = GameBoardItemObject._m(p, new THREE.DodecahedronGeometry(s * 0.3, 0), base, 0, y0 + 0.12, 0);
    b.scale.set(1, 0.5, 1); b.castShadow = true; b.receiveShadow = true;
    // Central crystal spire
    GameBoardItemObject._m(p, new THREE.ConeGeometry(s * 0.12, 0.45, 5), ice, 0, y0 + 0.42, 0).castShadow = true;
    // Flanking crystals
    for (const [dx, dz, h, r] of [[0.15, 0.1, 0.28, 0.07], [-0.12, -0.1, 0.22, 0.06], [0.05, -0.14, 0.2, 0.05]] as const) {
      const crystal = GameBoardItemObject._m(p, new THREE.ConeGeometry(s * r, h, 4), ice, s * dx, y0 + 0.12 + h * 0.5, s * dz);
      crystal.rotation.z = (Math.random() - 0.5) * 0.3;
      crystal.castShadow = true;
    }
    // Frost ring
    const ring = GameBoardItemObject._m(p, new THREE.TorusGeometry(s * 0.28, 0.02, 4, 16), frost, 0, y0 + 0.2, 0);
    ring.rotation.x = Math.PI / 2;
  }

  // ── Laser: emitter dish with energy lens ──────────────────────────────

  private static _buildLaser(p: THREE.Object3D, s: number, y0: number, base: THREE.Material, _accent: THREE.Material, metal: THREE.Material): void {
    const lens = new THREE.MeshStandardMaterial({ color: 0xcc66ff, emissive: 0x8833cc, emissiveIntensity: 0.6 });
    // Armoured pedestal
    const b = GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.3, s * 0.36, 0.16, 8), base, 0, y0 + 0.08, 0);
    b.castShadow = true; b.receiveShadow = true;
    // Rotating turret head
    GameBoardItemObject._m(p, new THREE.CylinderGeometry(s * 0.22, s * 0.26, 0.1, 8), metal, 0, y0 + 0.21, 0).castShadow = true;
    // Dish (parabolic reflector)
    const dish = GameBoardItemObject._m(p, new THREE.SphereGeometry(s * 0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), metal, 0, y0 + 0.3, s * 0.08);
    dish.rotation.x = Math.PI / 2 + 0.2;
    dish.castShadow = true;
    // Energy lens in the dish center
    GameBoardItemObject._m(p, new THREE.SphereGeometry(s * 0.08, 8, 6), lens, 0, y0 + 0.32, s * 0.12);
    // Support struts
    for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
      const sx = Math.sin(angle) * s * 0.18;
      const sz = Math.cos(angle) * s * 0.18;
      GameBoardItemObject._m(p, new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4), metal, sx, y0 + 0.2, sz);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /** Shorthand: create mesh, position it, add to parent. */
  private static _m(parent: THREE.Object3D, geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  /** Lighten a hex colour toward white by `factor` (0–1). */
  private static _brighten(hex: number, factor: number): number {
    const r = ((hex >> 16) & 0xff);
    const g = ((hex >> 8) & 0xff);
    const b = (hex & 0xff);
    return (Math.min(255, Math.round(r + (255 - r) * factor)) << 16) |
           (Math.min(255, Math.round(g + (255 - g) * factor)) << 8) |
           Math.min(255, Math.round(b + (255 - b) * factor));
  }
}
