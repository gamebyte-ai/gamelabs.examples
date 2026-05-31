import * as THREE from "three";
import { WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IAimLineView } from "./IAimLineView";
import { PlayAreaClipping } from "./PlayAreaClipping";
import { BubbleShooterConfig } from "../BubbleShooterConfig";
import type { IAimTrajectory, IAimTrajectorySegment } from "../models/IAimTrajectory";
import { BUBBLE_COLOR_HEX, BUBBLE_COLORS, type BubbleColor } from "../constants/BubbleColor";

const LANDING_PREVIEW_SEGMENTS = 48;
const AIM_DOT_SEGMENTS = 14;
const BUBBLE_VISUAL_RADIUS_FACTOR = 0.94;
const AIM_DOT_Z = 0.4;

/**
 * Aim feedback — marching dotted aim line + ghost landing preview.
 * The aim line is a pool of small disc meshes laid out at arc-length
 * intervals along the current trajectory; the marching animation is a
 * persistent phase offset advanced per frame. The landing preview is
 * a thin coloured ring that sits at the trajectory's resolved cell.
 */
export class AimLineView extends WorldViewBase implements IAimLineView {
  private _config: BubbleShooterConfig | null = null;
  private _clipping: PlayAreaClipping | null = null;

  private _aimDotGeometry: THREE.CircleGeometry | null = null;
  private _aimDotMaterial: THREE.MeshBasicMaterial | null = null;
  /** Tail-fade materials, white palette. Index 0 = closest to landing. */
  private readonly _aimDotFadeMaterials: THREE.MeshBasicMaterial[] = [];
  /** Power-up colour variants (red). */
  private _aimDotMaterialPowerUp: THREE.MeshBasicMaterial | null = null;
  private readonly _aimDotFadeMaterialsPowerUp: THREE.MeshBasicMaterial[] = [];
  private _aimDotPowerUpMode = false;
  private readonly _aimDotPool: THREE.Mesh[] = [];
  private _activeAimDots = 0;

  private _aimSegments: readonly IAimTrajectorySegment[] = [];
  private readonly _aimSegLengths: number[] = [];
  private readonly _aimSegCumLengths: number[] = [];
  private _aimTotalLength = 0;
  /**
   * Length actually rendered as dots — capped at
   * {@link BubbleShooterConfig.aimMaxLength} so the aim line has a
   * visible reach limit. Equals {@link _aimTotalLength} when the
   * cap is unset or the trajectory is shorter than it.
   */
  private _aimVisibleLength = 0;
  /** Persistent phase offset in [0, spacing); preserved across re-emits. */
  private _aimPhaseOffset = 0;

  private _landingPreviewGeometry: THREE.RingGeometry | null = null;
  private _landingPreviewMesh: THREE.Mesh | null = null;
  private readonly _landingPreviewMaterials = new Map<BubbleColor, THREE.MeshBasicMaterial>();
  /**
   * Aim-aid toggle. Gates the LANDING-PREVIEW ring only — the
   * marching dotted aim line is always visible. Starts `false` so
   * the player opts in to the target silhouette via the bottom-
   * left target button.
   */
  private _aimAidVisible = false;
  /** Latest landing's world position; cached so toggling on re-renders the ring without a fresh trajectory. */
  private _lastLandingX = 0;
  private _lastLandingY = 0;
  private _hasLanding = false;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BubbleShooterConfig);
    this._clipping = resolver.getInstance(PlayAreaClipping);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config;
    if (!config) return;
    this._buildAimDotResources(config);
    this._buildLandingPreview(config);
  }

  public setAimAidVisible(visible: boolean): void {
    if (this._aimAidVisible === visible) return;
    this._aimAidVisible = visible;
    this._applyLandingPreviewVisibility();
  }

  /**
   * Push the latest landing position + the toggle state out to the
   * preview mesh. Mesh shows iff the aid is open AND we have a
   * valid landing AND the visible aim-line span actually reaches it.
   */
  private _applyLandingPreviewVisibility(): void {
    const mesh = this._landingPreviewMesh;
    if (!mesh) return;
    if (!this._aimAidVisible || !this._hasLanding) {
      mesh.visible = false;
      return;
    }
    mesh.position.set(this._lastLandingX, this._lastLandingY, 0);
    mesh.visible = true;
  }

  public setAimTrajectory(trajectory: IAimTrajectory): void {
    this._aimSegments = trajectory.segments;
    this._aimSegLengths.length = 0;
    this._aimSegCumLengths.length = 0;
    let total = 0;
    for (const seg of trajectory.segments) {
      const dx = seg.toX - seg.fromX;
      const dy = seg.toY - seg.fromY;
      const len = Math.hypot(dx, dy);
      this._aimSegLengths.push(len);
      total += len;
      this._aimSegCumLengths.push(total);
    }
    this._aimTotalLength = total;
    const cap = this._config?.aimMaxLength ?? 0;
    this._aimVisibleLength = cap > 0 ? Math.min(total, cap) : total;
    this._refreshAimDotsAtPhase();
    // Cache the latest landing for the preview ring. The actual
    // mesh visibility is gated by the aim-aid toggle inside
    // `_applyLandingPreviewVisibility` — when the player has the
    // aid open, the silhouette renders at the resolved landing
    // even if it sits past the aim line's visible span.
    const landing = trajectory.landing;
    this._hasLanding = landing !== null;
    if (landing) {
      this._lastLandingX = landing.worldX;
      this._lastLandingY = landing.worldY;
    }
    this._applyLandingPreviewVisibility();
  }

  public updateAimDots(dt: number): void {
    if (this._aimVisibleLength <= 0 || !this._config) return;
    const spacing = this._config.aimDotSpacing;
    if (spacing <= 0) return;
    this._aimPhaseOffset = (this._aimPhaseOffset + this._config.aimDotFlowSpeed * dt) % spacing;
    if (this._aimPhaseOffset < 0) this._aimPhaseOffset += spacing;
    this._refreshAimDotsAtPhase();
  }

  public setAimPowerUpMode(active: boolean): void {
    if (this._aimDotPowerUpMode === active) return;
    this._aimDotPowerUpMode = active;
    this._refreshAimDotsAtPhase();
  }

  public setLandingPreviewColor(color: BubbleColor): void {
    const mat = this._landingPreviewMaterials.get(color);
    if (mat && this._landingPreviewMesh) this._landingPreviewMesh.material = mat;
  }

  /**
   * Place dots at arc-length positions `phase, phase + spacing, ...` until
   * the trajectory's end. Reflections fall out for free — the arc-length
   * walker maps any `s` through the segment list to a world point.
   *
   * Materials are assigned by distance-from-end: the last K dots fade
   * (closest to landing = most faded), everyone else uses full opacity.
   */
  private _refreshAimDotsAtPhase(): void {
    this._hideAllAimDots();
    if (!this._config || !this._aimDotGeometry || !this._aimDotMaterial) return;
    if (this._aimVisibleLength <= 0) return;
    const spacing = this._config.aimDotSpacing;
    const positions: { x: number; y: number }[] = [];
    for (let s = this._aimPhaseOffset; s < this._aimVisibleLength; s += spacing) {
      const pos = this._arcLengthToWorldPoint(s);
      if (pos) positions.push(pos);
    }
    const total = positions.length;
    const fullMat = this._aimDotPowerUpMode ? this._aimDotMaterialPowerUp : this._aimDotMaterial;
    const fadeMats = this._aimDotPowerUpMode ? this._aimDotFadeMaterialsPowerUp : this._aimDotFadeMaterials;
    if (!fullMat) return;
    const fadeCount = fadeMats.length;
    for (let i = 0; i < total; i++) {
      const dot = this._acquireAimDot();
      dot.position.set(positions[i]!.x, positions[i]!.y, AIM_DOT_Z);
      const tailIndex = total - 1 - i;
      dot.material = tailIndex < fadeCount ? fadeMats[tailIndex]! : fullMat;
      dot.visible = true;
    }
  }

  private _arcLengthToWorldPoint(s: number): { x: number; y: number } | null {
    for (let i = 0; i < this._aimSegments.length; i++) {
      const cumEnd = this._aimSegCumLengths[i]!;
      if (s <= cumEnd) {
        const segLen = this._aimSegLengths[i]!;
        const segStart = i === 0 ? 0 : this._aimSegCumLengths[i - 1]!;
        const t = segLen === 0 ? 0 : (s - segStart) / segLen;
        const seg = this._aimSegments[i]!;
        return {
          x: seg.fromX + (seg.toX - seg.fromX) * t,
          y: seg.fromY + (seg.toY - seg.fromY) * t,
        };
      }
    }
    return null;
  }

  private _acquireAimDot(): THREE.Mesh {
    if (this._activeAimDots < this._aimDotPool.length) {
      const dot = this._aimDotPool[this._activeAimDots]!;
      this._activeAimDots++;
      return dot;
    }
    const dot = new THREE.Mesh(this._aimDotGeometry!, this._aimDotMaterial!);
    dot.renderOrder = 10;
    this.add(dot);
    this._aimDotPool.push(dot);
    this._activeAimDots++;
    return dot;
  }

  private _hideAllAimDots(): void {
    for (let i = 0; i < this._activeAimDots; i++) this._aimDotPool[i]!.visible = false;
    this._activeAimDots = 0;
  }

  private _buildAimDotResources(config: BubbleShooterConfig): void {
    this._aimDotGeometry = new THREE.CircleGeometry(config.aimDotRadius, AIM_DOT_SEGMENTS);
    this._aimDotMaterial = this._createAimDotMaterial(config.aimDotColor, config.aimDotAlpha);
    this._aimDotMaterialPowerUp = this._createAimDotMaterial(config.aimDotPowerUpColor, config.aimDotAlpha);
    const K = Math.max(0, config.aimDotFadeTailCount);
    for (let i = 0; i < K; i++) {
      // i = 0 is the last dot (most faded); ramp linearly up to K/(K+1)
      // for the K-th-from-end so the gradient reads as smooth.
      const factor = (i + 1) / (K + 1);
      this._aimDotFadeMaterials.push(this._createAimDotMaterial(config.aimDotColor, config.aimDotAlpha * factor));
      this._aimDotFadeMaterialsPowerUp.push(this._createAimDotMaterial(config.aimDotPowerUpColor, config.aimDotAlpha * factor));
    }
  }

  private _createAimDotMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      clippingPlanes: this._clipping?.planes,
    });
  }

  private _buildLandingPreview(config: BubbleShooterConfig): void {
    const outer = config.bubbleRadius * BUBBLE_VISUAL_RADIUS_FACTOR;
    const inner = Math.max(0, outer - config.landingPreviewRingThickness);
    this._landingPreviewGeometry = new THREE.RingGeometry(inner, outer, LANDING_PREVIEW_SEGMENTS);
    const clippingPlanes = this._clipping?.planes;
    for (const color of BUBBLE_COLORS) {
      this._landingPreviewMaterials.set(
        color,
        new THREE.MeshBasicMaterial({
          color: BUBBLE_COLOR_HEX[color],
          transparent: true,
          opacity: config.landingPreviewOpacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          clippingPlanes,
        }),
      );
    }
    const initial = this._landingPreviewMaterials.get(BUBBLE_COLORS[0]!)!;
    const mesh = new THREE.Mesh(this._landingPreviewGeometry, initial);
    mesh.visible = false;
    this._landingPreviewMesh = mesh;
    this.add(mesh);
  }

  public override preDestroy(): void {
    for (const dot of this._aimDotPool) this.remove(dot);
    this._aimDotPool.length = 0;
    this._activeAimDots = 0;
    this._aimDotGeometry?.dispose();
    this._aimDotGeometry = null;
    this._aimDotMaterial?.dispose();
    this._aimDotMaterial = null;
    for (const mat of this._aimDotFadeMaterials) mat.dispose();
    this._aimDotFadeMaterials.length = 0;
    this._aimDotMaterialPowerUp?.dispose();
    this._aimDotMaterialPowerUp = null;
    for (const mat of this._aimDotFadeMaterialsPowerUp) mat.dispose();
    this._aimDotFadeMaterialsPowerUp.length = 0;

    if (this._landingPreviewMesh) {
      this.remove(this._landingPreviewMesh);
      this._landingPreviewMesh = null;
    }
    this._landingPreviewGeometry?.dispose();
    this._landingPreviewGeometry = null;
    for (const mat of this._landingPreviewMaterials.values()) mat.dispose();
    this._landingPreviewMaterials.clear();

    this._config = null;
    super.preDestroy();
  }
}
