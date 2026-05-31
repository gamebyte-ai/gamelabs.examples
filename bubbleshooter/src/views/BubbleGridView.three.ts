import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IBubbleGridView } from "./IBubbleGridView";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import { BubbleGridLayout } from "../utilities/BubbleGridLayout";
import { ALL_BUBBLE_COLORS, BUBBLE_COLOR_HEX, type BubbleColor } from "../constants/BubbleColor";
import { BUBBLE_COLOR_TO_ASSET_ID } from "../BubbleShooterAssetIds";

const BUBBLE_DISC_SEGMENTS = 48;
const BUBBLE_VISUAL_RADIUS_FACTOR = 0.94;
const CELL_RING_SEGMENTS = 32;

interface IBubbleShake {
  // Base position is no longer cached on the shake — the per-frame
  // tick re-queries `layout.getCellWorldPosition` and adds the
  // descent visual offset, so the shake composes correctly while
  // the grid is mid-animation.
  readonly dirX: number;
  readonly dirY: number;
  readonly peak: number;
  readonly omega: number;
  readonly decay: number;
  age: number;
  readonly lifetime: number;
}

/**
 * The cluster bubble grid. Owns one mesh per occupied cell in the
 * grid, keyed by `row|col`. Also runs the jelly-wobble snap shake —
 * after a fired bubble settles, a damped sine impulse propagates
 * outward through occupied-neighbour adjacency for a few hex rings,
 * each ring scaled down by the falloff.
 */
export class BubbleGridView extends WorldViewBase implements IBubbleGridView {
  private _config: BubbleShooterConfig | null = null;
  private _layout: BubbleGridLayout | null = null;
  private _clipping: PlayAreaClipping | null = null;

  private _bubbleGeometry: THREE.CircleGeometry | null = null;
  private readonly _bubbleMaterials = new Map<BubbleColor, THREE.MeshBasicMaterial>();
  private readonly _bubbleMeshes = new Map<string, THREE.Mesh>();
  private readonly _bubbleShakes = new Map<string, IBubbleShake>();

  /**
   * Cell-outline rings drawn at every empty grid cell (and behind
   * the placed bubbles). Owned alongside the bubble meshes so they
   * follow the same descent + width updates — cell outlines must
   * stay aligned with the bubbles they back.
   */
  private _cellOutlineGeometry: THREE.RingGeometry | null = null;
  private _cellOutlineMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly _cellOutlines: { row: number; col: number; mesh: THREE.Mesh }[] = [];

  /**
   * Thin strip drawn at the grid's top edge — makes the
   * descending ceiling visible. Travels with the grid (descents
   * shift its Y); rebuilt on width change because its X-extent
   * matches `gridWidth`.
   */
  private _ceilingStripMesh: THREE.Mesh | null = null;

  /**
   * Visual lag for the descent animation. Positive Y offset added
   * on top of the layout's logical position so meshes visually
   * sit at their pre-descent location and slide down to zero over
   * `gridDescentDurationSeconds`. Logical layout is the source of
   * truth for trajectory + loss check; this is purely cosmetic.
   */
  private _descentAnimVisualOffset = 0;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._layout = resolver.getInstance(BubbleGridLayout);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    if (!config) return;
    this._bubbleGeometry = new THREE.CircleGeometry(
      config.bubbleRadius * BUBBLE_VISUAL_RADIUS_FACTOR,
      BUBBLE_DISC_SEGMENTS,
    );
    const clippingPlanes = this._clipping?.planes;
    for (const color of ALL_BUBBLE_COLORS) {
      const tex = this.assetLoader.getAsset<THREE.Texture>(BUBBLE_COLOR_TO_ASSET_ID[color]);
      this._bubbleMaterials.set(
        color,
        tex
          ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, clippingPlanes })
          : new THREE.MeshBasicMaterial({ color: BUBBLE_COLOR_HEX[color], transparent: true, depthWrite: false, clippingPlanes }),
      );
    }
    this._buildCellOutlines();
    this._buildCeilingStrip();
  }

  private _buildCeilingStrip(): void {
    const layout = this._layout;
    const config = this._config;
    if (!layout || !config) return;
    const geo = new THREE.PlaneGeometry(layout.gridWidth, config.gridCeilingStripThickness);
    const mat = new THREE.MeshBasicMaterial({
      color: config.gridCeilingStripColor,
      transparent: true,
      opacity: 0.85,
      clippingPlanes: this._clipping?.planes,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, layout.gridOriginY, 0);
    this._ceilingStripMesh = mesh;
    this.add(mesh);
  }

  private _disposeCeilingStrip(): void {
    if (!this._ceilingStripMesh) return;
    this.remove(this._ceilingStripMesh);
    this._ceilingStripMesh.geometry.dispose();
    (this._ceilingStripMesh.material as THREE.MeshBasicMaterial).dispose();
    this._ceilingStripMesh = null;
  }

  /**
   * Build a ring outline for every grid cell at the layout's
   * current row/col counts and world Ys (which include the active
   * descend offset). Called on first init AND on width change
   * (`rebuildCellOutlines`) — the cell count varies per level.
   */
  private _buildCellOutlines(): void {
    const layout = this._layout;
    const config = this._config;
    if (!layout || !config) return;
    const r = layout.bubbleRadius;
    const inner = Math.max(0, r - config.cellOutlineThickness);
    this._cellOutlineGeometry = new THREE.RingGeometry(inner, r, CELL_RING_SEGMENTS);
    this._cellOutlineMaterial = new THREE.MeshBasicMaterial({
      color: config.cellOutlineColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      clippingPlanes: this._clipping?.planes,
    });
    for (let row = 0; row < layout.rowCount; row++) {
      const colCount = layout.getColumnCount(row);
      for (let col = 0; col < colCount; col++) {
        const pos = layout.getCellWorldPosition(row, col);
        const mesh = new THREE.Mesh(this._cellOutlineGeometry, this._cellOutlineMaterial);
        mesh.position.set(pos.x, pos.y, 0);
        this.add(mesh);
        this._cellOutlines.push({ row, col, mesh });
      }
    }
  }

  private _disposeCellOutlines(): void {
    for (const o of this._cellOutlines) this.remove(o.mesh);
    this._cellOutlines.length = 0;
    this._cellOutlineGeometry?.dispose();
    this._cellOutlineGeometry = null;
    this._cellOutlineMaterial?.dispose();
    this._cellOutlineMaterial = null;
  }

  public setBubble(row: number, col: number, color: BubbleColor): void {
    const layout = this._layout;
    const geometry = this._bubbleGeometry;
    if (!layout || !geometry) return;
    const material = this._bubbleMaterials.get(color);
    if (!material) return;
    const pos = layout.getCellWorldPosition(row, col);
    // Apply the active descent visual offset so a freshly-snapped
    // bubble sits in the same animated frame as the rest of the
    // grid (otherwise it would render at the post-descent target
    // while the cluster is still mid-animation).
    const y = pos.y + this._descentAnimVisualOffset;
    const key = this._key(row, col);
    let mesh = this._bubbleMeshes.get(key);
    if (mesh) {
      mesh.material = material;
      mesh.position.set(pos.x, y, 0);
      return;
    }
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, y, 0);
    this._bubbleMeshes.set(key, mesh);
    this.add(mesh);
  }

  public removeBubble(row: number, col: number): void {
    const key = this._key(row, col);
    const mesh = this._bubbleMeshes.get(key);
    if (!mesh) return;
    this.remove(mesh);
    this._bubbleMeshes.delete(key);
    this._bubbleShakes.delete(key);
  }

  /**
   * Kick off a jelly-wobble ripple. BFS across hex neighbours up to
   * `snapShakeRingCount` rings; only propagates through occupied
   * cells (an empty neighbour breaks the chain). Each ring's peak is
   * scaled by `snapShakeRingFalloff^(depth-1)`. Each shaken mesh
   * runs a damped sine outward from the snap centre and settles back.
   */
  public playSnapShake(snapRow: number, snapCol: number): void {
    const layout = this._layout;
    const config = this._config;
    if (!layout || !config) return;
    const basePeak = config.snapShakePeakOffset;
    const lifetime = config.snapShakeDurationSeconds;
    const ringCount = config.snapShakeRingCount;
    const falloff = config.snapShakeRingFalloff;
    if (basePeak <= 0 || lifetime <= 0 || ringCount <= 0) return;
    const omega = 2 * Math.PI * config.snapShakeFrequencyHz;
    const decay = config.snapShakeDecayRate;
    const snapPos = layout.getCellWorldPosition(snapRow, snapCol);

    const visited = new Set<string>();
    visited.add(this._key(snapRow, snapCol));
    let frontier: { row: number; col: number }[] = [{ row: snapRow, col: snapCol }];

    for (let depth = 1; depth <= ringCount; depth++) {
      const ringPeak = basePeak * Math.pow(falloff, depth - 1);
      const next: { row: number; col: number }[] = [];
      for (const cur of frontier) {
        for (const off of layout.getNeighborOffsets(cur.row)) {
          const nr = cur.row + off.dRow;
          const nc = cur.col + off.dCol;
          const key = this._key(nr, nc);
          if (visited.has(key)) continue;
          visited.add(key);
          if (!layout.isInBounds(nr, nc)) continue;
          // Empty cells break the propagation chain.
          const mesh = this._bubbleMeshes.get(key);
          if (!mesh) continue;
          next.push({ row: nr, col: nc });
          const cellPos = layout.getCellWorldPosition(nr, nc);
          let dx = cellPos.x - snapPos.x;
          let dy = cellPos.y - snapPos.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.0001) {
            dx = 0;
            dy = 1;
          } else {
            dx /= len;
            dy /= len;
          }
          this._bubbleShakes.set(key, {
            dirX: dx,
            dirY: dy,
            peak: ringPeak,
            omega,
            decay,
            age: 0,
            lifetime,
          });
        }
      }
      frontier = next;
    }
  }

  /**
   * Kick off the smooth-descent animation for `rows` row pitches.
   * Logical layout has already advanced (`getCellWorldPosition`
   * returns post-descent positions); we add `rows * rowPitch` to
   * the visual offset so the meshes momentarily stay at their old
   * spot, then `tickGridAnimation` decays it to zero. Multi-row
   * auto-descents stack here naturally — N rows means a single
   * continuous slide that takes N×duration to complete. Snap
   * shakes keep playing — the per-frame tick composes shake
   * offsets on top of the live layout + descent offset, so a
   * wobble started just before the descent continues smoothly
   * through it.
   */
  public playDescent(rows: number): void {
    const layout = this._layout;
    if (!layout || rows <= 0) return;
    this._descentAnimVisualOffset += rows * layout.rowPitch;
  }

  /**
   * Snap visual state to the current layout — instant, no
   * animation. Called when the layout itself changes (level load,
   * width override): rebuilds chrome with the new dimensions,
   * clears any in-flight shakes (their kinematics are tied to
   * cells that may no longer exist), and resets the descent
   * visual offset so meshes sit at logical positions immediately.
   */
  public applyLayoutReset(): void {
    this._disposeCellOutlines();
    this._disposeCeilingStrip();
    this._buildCellOutlines();
    this._buildCeilingStrip();
    this._descentAnimVisualOffset = 0;
    this._bubbleShakes.clear();
    this._applyVisualPositions();
  }

  /**
   * Per-frame tick for descent + shake animation. Decays the
   * descent visual offset toward zero (linear over
   * `gridDescentDurationSeconds` per row), advances each shake's
   * age + drops finished ones, and re-applies positions to every
   * bubble mesh, cell outline, and the ceiling strip. Skips work
   * when nothing is animating.
   */
  public tickGridAnimation(dt: number): void {
    const layout = this._layout;
    const config = this._config;
    if (!layout || !config) return;

    const animatingDescent = this._descentAnimVisualOffset > 0;
    const animatingShake = this._bubbleShakes.size > 0;
    if (!animatingDescent && !animatingShake) return;

    if (animatingDescent) {
      const speed = layout.rowPitch / Math.max(0.001, config.gridDescentDurationSeconds);
      this._descentAnimVisualOffset = Math.max(0, this._descentAnimVisualOffset - speed * dt);
    }

    if (animatingShake) {
      for (const [key, shake] of this._bubbleShakes) {
        shake.age += dt;
        if (shake.age >= shake.lifetime) this._bubbleShakes.delete(key);
      }
    }

    this._applyVisualPositions();
  }

  /**
   * Push the current logical layout + descent visual offset +
   * (optional shake offset) out to every bubble mesh, cell outline
   * and the ceiling strip. Called both from the per-frame tick and
   * from `applyLayoutReset` to snap straight to the new layout.
   */
  private _applyVisualPositions(): void {
    const layout = this._layout;
    if (!layout) return;
    const offset = this._descentAnimVisualOffset;
    for (const [key, mesh] of this._bubbleMeshes) {
      const sep = key.indexOf("|");
      const row = Number.parseInt(key.slice(0, sep), 10);
      const col = Number.parseInt(key.slice(sep + 1), 10);
      const pos = layout.getCellWorldPosition(row, col);
      let x = pos.x;
      let y = pos.y + offset;
      const shake = this._bubbleShakes.get(key);
      if (shake) {
        const t = shake.age;
        const sineOffset = shake.peak * Math.exp(-shake.decay * t) * Math.sin(shake.omega * t);
        x += shake.dirX * sineOffset;
        y += shake.dirY * sineOffset;
      }
      mesh.position.set(x, y, 0);
    }
    for (const o of this._cellOutlines) {
      const pos = layout.getCellWorldPosition(o.row, o.col);
      o.mesh.position.set(pos.x, pos.y + offset, 0);
    }
    if (this._ceilingStripMesh) this._ceilingStripMesh.position.y = layout.gridOriginY + offset;
  }

  private _key(row: number, col: number): string {
    return `${row}|${col}`;
  }

  public override preDestroy(): void {
    this._disposeCeilingStrip();
    this._disposeCellOutlines();
    for (const mesh of this._bubbleMeshes.values()) this.remove(mesh);
    this._bubbleMeshes.clear();
    this._bubbleShakes.clear();
    for (const mat of this._bubbleMaterials.values()) mat.dispose();
    this._bubbleMaterials.clear();
    this._bubbleGeometry?.dispose();
    this._bubbleGeometry = null;
    this._config = null;
    this._layout = null;
    super.preDestroy();
  }
}
