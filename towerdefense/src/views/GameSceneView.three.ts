import * as THREE from "three";
import { World, WorldViewBase, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { TowerDefenseConfig } from "../TowerDefenseConfig.js";
import { ILevelState } from "../utilities/ILevelState.js";
import type { ILevelState as ILevelStateType } from "../utilities/ILevelState.js";
import { EnemyTypeId, type EnemyTypeDef } from "../constants/EnemyTypeDef.js";
import type { IEnemyState } from "../utilities/EnemyManager.js";
import type { IProjectileState, ITowerState } from "../utilities/CombatManager.js";
import { BillboardHealthBar } from "./BillboardHealthBar.js";
import type { IGameSceneView } from "./IGameSceneView.js";

interface EnemyMeshRecord {
  group: THREE.Group;
  healthBar: BillboardHealthBar;
  freezeOverlay: THREE.Mesh | null;
  typeDef: EnemyTypeDef;
}

interface ProjectileMeshRecord {
  mesh: THREE.Mesh;
  trailAccum: number;
  kind: "linear" | "arc";
}

interface BeamRecord {
  line: THREE.Line;
}

interface TrailParticle { sprite: THREE.Sprite; life: number; maxLife: number; }
interface ShockwaveRing { mesh: THREE.Mesh; life: number; maxLife: number; targetScale: number; }
interface ArcVisual { line: THREE.Line; life: number; maxLife: number; }

/**
 * World-scene host. Owns:
 * - scene lighting / fog / sky (per AGENTS.md "Scene setup belongs in views")
 * - base HP bar + floating gold popups
 * - enemy meshes, reconciled each frame from `EnemyManager` state
 * - projectile meshes + laser beams, reconciled each frame from `CombatManager` state
 * - ephemeral combat effects (shockwave rings, tesla arcs, projectile trails)
 *   driven either by events (`onAreaImpact`, `onTeslaArcFired`) or by
 *   internal timers during projectile reconciliation.
 */
export class GameSceneView extends WorldViewBase implements IGameSceneView {
  // ── Base HP bar constants ─────────────────────────────────────────────
  private static readonly BASE_BAR_W = 0.6;
  private static readonly BASE_BAR_H = 0.08;
  private static readonly BASE_BAR_Y = 0.55;

  // ── Enemy mesh constants ──────────────────────────────────────────────
  private static readonly ENEMY_BASE_RADIUS = 0.18;
  private static readonly ENEMY_FLOAT_Y = 0.32;
  private static readonly ENEMY_HP_BAR_W = 0.35;
  private static readonly ENEMY_HP_BAR_H = 0.05;
  private static readonly ENEMY_HP_BAR_Y = 0.28;

  // ── Combat visual constants ──────────────────────────────────────────
  private static readonly PROJECTILE_RADIUS = 0.06;
  private static readonly ARC_PROJECTILE_RADIUS = 0.1;
  private static readonly TOWER_LAUNCH_Y = 0.5;
  private static readonly TRAIL_INTERVAL = 0.03;
  private static readonly TRAIL_LIFE_LINEAR = 0.15;
  private static readonly TRAIL_LIFE_ARC = 0.25;
  private static readonly TRAIL_SIZE_LINEAR = 0.04;
  private static readonly TRAIL_SIZE_ARC = 0.07;
  private static readonly SHOCKWAVE_LIFE = 0.4;
  private static readonly ARC_VISUAL_LIFE = 0.12;
  private static readonly ARC_SEGMENTS = 8;

  private static _trailTexture: THREE.CanvasTexture | null = null;

  // ── State ────────────────────────────────────────────────────────────
  private readonly _enemyContainer = new THREE.Group();
  private readonly _combatContainer = new THREE.Group();
  private _baseHpBar: BillboardHealthBar | null = null;
  private _config: TowerDefenseConfig | null = null;
  private _level: ILevelStateType | null = null;
  private _world: World | null = null;

  private readonly _enemyMeshes = new Map<number, EnemyMeshRecord>();
  private readonly _projectileMeshes = new Map<number, ProjectileMeshRecord>();
  private readonly _beams = new Map<string, BeamRecord>();
  private readonly _trails: TrailParticle[] = [];
  private readonly _shockwaves: ShockwaveRing[] = [];
  private readonly _arcs: ArcVisual[] = [];
  private readonly _goldPopups: { sprite: THREE.Sprite; elapsed: number }[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(TowerDefenseConfig);
    this._level = resolver.getInstance(ILevelState);
    this._world = resolver.getInstance(World);
  }

  public override initialize(): void {
    super.initialize();
    if (!this._config) return;

    const midX = ((this._config.cols - 1) * this._config.cellSize) * 0.5;
    const midZ = ((this._config.rows - 1) * this._config.cellSize) * 0.5;
    this._enemyContainer.position.set(-midX, 0, -midZ);
    this._combatContainer.position.set(-midX, 0, -midZ);
    this.add(this._enemyContainer);
    this.add(this._combatContainer);

    this._setupLighting();
  }

  // ── Lighting rig ─────────────────────────────────────────────────────

  private _setupLighting(): void {
    if (!this._world) return;
    const scene = this._world.scene;
    const renderer = this._world.renderer;

    scene.traverse((child) => {
      if (child instanceof THREE.Light) child.intensity = 0;
    });

    const hemi = new THREE.HemisphereLight(0xb4c8e0, 0x1a2a1a, 0.8);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
    sun.position.set(-5, 10, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 25;
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xd0e0ff, 0.35);
    fill.position.set(4, 5, 6);
    scene.add(fill);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const skySize = 256;
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 1;
    skyCanvas.height = skySize;
    const skyCtx = skyCanvas.getContext("2d")!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, skySize);
    grad.addColorStop(0, "#1a2a44");
    grad.addColorStop(0.5, "#3a5a7a");
    grad.addColorStop(0.85, "#6a8aaa");
    grad.addColorStop(1, "#8aaabb");
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 1, skySize);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;

    scene.fog = new THREE.Fog(0x6a8aaa, 14, 35);
    renderer.setClearColor(0x6a8aaa, 1);
  }

  // ── Base HP bar ──────────────────────────────────────────────────────

  public showBaseHpBar(): void {
    this.hideBaseHpBar();
    if (!this._config || !this._level) return;
    const path = this._level.pathWaypoints;
    if (path.length === 0) return;

    const [baseCol, baseRow] = path[path.length - 1];
    const midX = ((this._config.cols - 1) * this._config.cellSize) * 0.5;
    const midZ = ((this._config.rows - 1) * this._config.cellSize) * 0.5;

    const { BASE_BAR_W, BASE_BAR_H, BASE_BAR_Y } = GameSceneView;
    this._baseHpBar = new BillboardHealthBar(BASE_BAR_W, BASE_BAR_H, 0x440000, 0xdd8844);
    this._baseHpBar.position.set(baseCol - midX, BASE_BAR_Y, baseRow - midZ);
    this.add(this._baseHpBar);
    this._baseHpBar.setRatio(1);
  }

  public setBaseHpRatio(ratio: number): void {
    this._baseHpBar?.setRatio(ratio);
  }

  public hideBaseHpBar(): void {
    if (this._baseHpBar) {
      this._baseHpBar.dispose();
      this._baseHpBar.removeFromParent();
      this._baseHpBar = null;
    }
  }

  // ── Gold popup ───────────────────────────────────────────────────────

  private static readonly POPUP_SIZE = 64;
  private static readonly POPUP_START_Y = 0.5;
  private static readonly POPUP_RISE = 0.8;
  private static readonly POPUP_DURATION = 0.8;

  public showGoldPopup(worldX: number, worldZ: number, amount: number): void {
    const sprite = GameSceneView._createGoldSprite(amount);
    sprite.position.set(worldX, GameSceneView.POPUP_START_Y, worldZ);
    this._enemyContainer.add(sprite);
    this._goldPopups.push({ sprite, elapsed: 0 });
  }

  // ── Enemy reconciliation ─────────────────────────────────────────────

  public reconcileEnemies(enemies: ReadonlyArray<IEnemyState>): void {
    const seen = new Set<number>();
    for (const e of enemies) {
      seen.add(e.id);
      let record = this._enemyMeshes.get(e.id);
      if (!record) {
        record = this._createEnemyMesh(e.typeDef);
        this._enemyContainer.add(record.group);
        this._enemyMeshes.set(e.id, record);
      }
      record.group.position.set(e.posX, GameSceneView.ENEMY_FLOAT_Y * e.typeDef.scale, e.posZ);
      const spd2 = e.velX * e.velX + e.velZ * e.velZ;
      if (spd2 > 0.001) record.group.rotation.y = Math.atan2(e.velX, e.velZ);
      record.healthBar.setRatio(e.hp / e.typeDef.hp);
      const frozen = e.freezeTimer > 0;
      if (frozen && !record.freezeOverlay) this._addFreezeOverlay(record);
      else if (!frozen && record.freezeOverlay) this._removeFreezeOverlay(record);
    }
    for (const [id, record] of this._enemyMeshes) {
      if (seen.has(id)) continue;
      this._disposeEnemyMesh(record);
      this._enemyMeshes.delete(id);
    }
  }

  private _createEnemyMesh(typeDef: EnemyTypeDef): EnemyMeshRecord {
    const r = GameSceneView.ENEMY_BASE_RADIUS * typeDef.scale;
    const mat = new THREE.MeshStandardMaterial({ color: typeDef.color, metalness: 0.2, roughness: 0.5 });
    const group = new THREE.Group();
    if (typeDef.id === EnemyTypeId.Brute) {
      GameSceneView._buildBruteMesh(group, r, mat);
    } else {
      GameSceneView._buildScoutMesh(group, r, mat);
    }
    group.castShadow = true;
    group.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = true; });
    const healthBar = new BillboardHealthBar(GameSceneView.ENEMY_HP_BAR_W, GameSceneView.ENEMY_HP_BAR_H);
    healthBar.position.y = (GameSceneView.ENEMY_HP_BAR_Y + r) * typeDef.scale;
    group.add(healthBar);
    return { group, healthBar, freezeOverlay: null, typeDef };
  }

  private _disposeEnemyMesh(record: EnemyMeshRecord): void {
    this._removeFreezeOverlay(record);
    record.healthBar.dispose();
    record.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
    record.group.removeFromParent();
  }

  private _addFreezeOverlay(record: EnemyMeshRecord): void {
    if (record.freezeOverlay) return;
    const r = GameSceneView.ENEMY_BASE_RADIUS * record.typeDef.scale * 1.3;
    const geom = new THREE.SphereGeometry(r, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x88ddff, emissive: 0x2288cc, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.35,
    });
    const overlay = new THREE.Mesh(geom, mat);
    record.group.add(overlay);
    record.freezeOverlay = overlay;
  }

  private _removeFreezeOverlay(record: EnemyMeshRecord): void {
    if (!record.freezeOverlay) return;
    record.freezeOverlay.geometry.dispose();
    (record.freezeOverlay.material as THREE.Material).dispose();
    record.freezeOverlay.removeFromParent();
    record.freezeOverlay = null;
  }

  /** Scout — sleek insectoid dart. Teardrop body, swept-back wings, glowing eyes. */
  private static _buildScoutMesh(group: THREE.Group, r: number, mat: THREE.Material): void {
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 10, 7), mat);
    group.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 1.6, 6), mat);
    tail.rotation.x = Math.PI;
    tail.position.y = -r * 0.5;
    group.add(tail);

    const wingMat = new THREE.MeshStandardMaterial({ color: 0xbb44dd, metalness: 0.3, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, r * 0.06, r * 0.5), wingMat);
      wing.position.set(side * r * 0.7, r * 0.1, -r * 0.1);
      wing.rotation.z = side * 0.3;
      wing.rotation.y = side * -0.2;
      group.add(wing);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 0.8 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 5, 4), eyeMat);
      eye.position.set(side * r * 0.3, r * 0.25, r * 0.6);
      group.add(eye);
    }
  }

  /** Brute — heavy golem. Rocky torso, arm stumps, spike horns, glowing eyes. */
  private static _buildBruteMesh(group: THREE.Group, r: number, mat: THREE.Material): void {
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.95, 0), mat);
    torso.scale.set(1, 0.85, 0.8);
    torso.position.y = r * 0.15;
    group.add(torso);

    const headMat = new THREE.MeshStandardMaterial({ color: 0x339977, metalness: 0.25, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 6, 4), headMat);
    head.position.y = r * 1.0;
    group.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.3, r * 0.7, 6), mat);
      arm.position.set(side * r * 0.9, r * 0.1, 0);
      arm.rotation.z = side * 0.4;
      group.add(arm);
    }

    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x226655, metalness: 0.4, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.15, r * 0.5, 4), spikeMat);
      spike.position.set(side * r * 0.65, r * 0.85, 0);
      spike.rotation.z = side * -0.5;
      group.add(spike);
    }

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0xff8811, emissiveIntensity: 0.6 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 4, 3), eyeMat);
      eye.position.set(side * r * 0.22, r * 1.05, r * 0.25);
      group.add(eye);
    }
  }

  // ── Projectile reconciliation ────────────────────────────────────────

  public reconcileProjectiles(projectiles: ReadonlyArray<IProjectileState>): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let record = this._projectileMeshes.get(p.id);
      if (!record) {
        record = this._createProjectileMesh(p);
        this._combatContainer.add(record.mesh);
        this._projectileMeshes.set(p.id, record);
      }
      record.mesh.position.set(p.posX, p.posY, p.posZ);
    }
    for (const [id, record] of this._projectileMeshes) {
      if (seen.has(id)) continue;
      this._disposeProjectileMesh(record);
      this._projectileMeshes.delete(id);
    }
  }

  private _createProjectileMesh(p: IProjectileState): ProjectileMeshRecord {
    const radius = p.kind === "arc" ? GameSceneView.ARC_PROJECTILE_RADIUS : GameSceneView.PROJECTILE_RADIUS;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 6, 4),
      new THREE.MeshStandardMaterial({ color: p.color, metalness: 0.3, roughness: 0.4 }),
    );
    return { mesh, trailAccum: 0, kind: p.kind };
  }

  private _disposeProjectileMesh(record: ProjectileMeshRecord): void {
    record.mesh.geometry.dispose();
    (record.mesh.material as THREE.Material).dispose();
    record.mesh.removeFromParent();
  }

  // ── Laser beam reconciliation ────────────────────────────────────────

  public reconcileLaserBeams(
    towers: ReadonlyArray<ITowerState>,
    enemies: ReadonlyArray<IEnemyState>,
  ): void {
    const seen = new Set<string>();
    for (const tower of towers) {
      if (tower.lockedTargetId <= 0) continue;
      const target = enemies.find((e) => e.id === tower.lockedTargetId);
      if (!target) continue;

      const key = `${tower.col},${tower.row}`;
      seen.add(key);

      const tY = GameSceneView.TOWER_LAUNCH_Y;
      const eY = 0.32 * target.typeDef.scale;
      let record = this._beams.get(key);
      if (!record) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(tower.col, tY, tower.row),
          new THREE.Vector3(target.posX, eY, target.posZ),
        ]);
        const mat = new THREE.LineBasicMaterial({ color: 0xcc66ff, transparent: true, opacity: 0.85 });
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 95;
        this._combatContainer.add(line);
        record = { line };
        this._beams.set(key, record);
      } else {
        const pos = record.line.geometry.attributes["position"] as THREE.BufferAttribute;
        pos.setXYZ(0, tower.col, tY, tower.row);
        pos.setXYZ(1, target.posX, eY, target.posZ);
        pos.needsUpdate = true;
      }
    }
    for (const [key, record] of this._beams) {
      if (seen.has(key)) continue;
      record.line.geometry.dispose();
      (record.line.material as THREE.Material).dispose();
      record.line.removeFromParent();
      this._beams.delete(key);
    }
  }

  // ── Per-frame animation tick ─────────────────────────────────────────

  public tickAnimations(dt: number): void {
    this._tickGoldPopups(dt);
    this._tickProjectileTrails(dt);
    this._tickTrails(dt);
    this._tickShockwaves(dt);
    this._tickArcs(dt);
  }

  private _tickGoldPopups(dt: number): void {
    for (let i = this._goldPopups.length - 1; i >= 0; i--) {
      const p = this._goldPopups[i];
      p.elapsed += dt;
      const t = Math.min(1, p.elapsed / GameSceneView.POPUP_DURATION);
      p.sprite.position.y = GameSceneView.POPUP_START_Y + GameSceneView.POPUP_RISE * t;
      (p.sprite.material as THREE.SpriteMaterial).opacity = 1 - t;
      if (t >= 1) {
        GameSceneView._disposeGoldSprite(p.sprite);
        this._goldPopups.splice(i, 1);
      }
    }
  }

  private _tickProjectileTrails(dt: number): void {
    for (const [, record] of this._projectileMeshes) {
      record.trailAccum += dt;
      if (record.trailAccum < GameSceneView.TRAIL_INTERVAL) continue;
      record.trailAccum -= GameSceneView.TRAIL_INTERVAL;
      this._spawnTrail(record.mesh.position.x, record.mesh.position.y, record.mesh.position.z, record.kind === "arc");
    }
  }

  // ── Trail particles ──────────────────────────────────────────────────

  private _spawnTrail(x: number, y: number, z: number, isArc: boolean): void {
    const tex = GameSceneView._getTrailTexture();
    const color = isArc ? 0xff6622 : 0x88ff88;
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.7, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const sz = isArc ? GameSceneView.TRAIL_SIZE_ARC : GameSceneView.TRAIL_SIZE_LINEAR;
    sprite.scale.set(sz, sz, 1);
    sprite.position.set(x, y, z);
    this._combatContainer.add(sprite);
    const life = isArc ? GameSceneView.TRAIL_LIFE_ARC : GameSceneView.TRAIL_LIFE_LINEAR;
    this._trails.push({ sprite, life, maxLife: life });
  }

  private _tickTrails(dt: number): void {
    for (let i = this._trails.length - 1; i >= 0; i--) {
      const t = this._trails[i];
      t.life -= dt;
      (t.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, (t.life / t.maxLife) * 0.7);
      if (t.life <= 0) {
        (t.sprite.material as THREE.SpriteMaterial).dispose();
        t.sprite.removeFromParent();
        this._trails.splice(i, 1);
      }
    }
  }

  private static _getTrailTexture(): THREE.CanvasTexture {
    if (GameSceneView._trailTexture) return GameSceneView._trailTexture;
    const sz = 32;
    const c = document.createElement("canvas");
    c.width = sz; c.height = sz;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sz, sz);
    GameSceneView._trailTexture = new THREE.CanvasTexture(c);
    return GameSceneView._trailTexture;
  }

  // ── Shockwave rings (area impacts) ──────────────────────────────────

  public spawnShockwave(x: number, z: number, radius: number): void {
    const geom = new THREE.RingGeometry(radius - 0.06, radius + 0.06, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4422, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(geom, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    ring.scale.set(0.01, 0.01, 0.01);
    ring.renderOrder = 90;
    this._combatContainer.add(ring);
    this._shockwaves.push({
      mesh: ring, life: GameSceneView.SHOCKWAVE_LIFE,
      maxLife: GameSceneView.SHOCKWAVE_LIFE, targetScale: 1,
    });
  }

  private _tickShockwaves(dt: number): void {
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.life -= dt;
      const t = 1 - sw.life / sw.maxLife;
      const s = sw.targetScale * t;
      sw.mesh.scale.set(s, s, s);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
      if (sw.life <= 0) {
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
        sw.mesh.removeFromParent();
        this._shockwaves.splice(i, 1);
      }
    }
  }

  // ── Electric arcs (Tesla) ─────────────────────────────────────────────

  public spawnTeslaArc(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    const n = GameSceneView.ARC_SEGMENTS;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      const bz = z1 + (z2 - z1) * t;
      const jitter = (i > 0 && i < n) ? 0.08 : 0;
      points.push(new THREE.Vector3(
        bx + (Math.random() - 0.5) * jitter,
        by + (Math.random() - 0.5) * jitter,
        bz + (Math.random() - 0.5) * jitter,
      ));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geom, mat);
    line.renderOrder = 95;
    this._combatContainer.add(line);
    this._arcs.push({ line, life: GameSceneView.ARC_VISUAL_LIFE, maxLife: GameSceneView.ARC_VISUAL_LIFE });
  }

  private _tickArcs(dt: number): void {
    for (let i = this._arcs.length - 1; i >= 0; i--) {
      const a = this._arcs[i];
      a.life -= dt;
      (a.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, (a.life / a.maxLife) * 0.9);
      if (a.life <= 0) {
        a.line.geometry.dispose();
        (a.line.material as THREE.Material).dispose();
        a.line.removeFromParent();
        this._arcs.splice(i, 1);
      }
    }
  }

  // ── Gold sprite helpers ──────────────────────────────────────────────

  private static _disposeGoldSprite(sprite: THREE.Sprite): void {
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.dispose();
    sprite.removeFromParent();
  }

  private static _createGoldSprite(amount: number): THREE.Sprite {
    const sz = GameSceneView.POPUP_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = sz;
    canvas.height = sz;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffdd44";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    const text = `+${amount}g`;
    ctx.strokeText(text, sz / 2, sz / 2);
    ctx.fillText(text, sz / 2, sz / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.4, 0.4, 1);
    sprite.renderOrder = 200;
    return sprite;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  public override preDestroy(): void {
    this.hideBaseHpBar();

    for (const p of this._goldPopups) GameSceneView._disposeGoldSprite(p.sprite);
    this._goldPopups.length = 0;

    for (const record of this._enemyMeshes.values()) this._disposeEnemyMesh(record);
    this._enemyMeshes.clear();

    for (const record of this._projectileMeshes.values()) this._disposeProjectileMesh(record);
    this._projectileMeshes.clear();

    for (const record of this._beams.values()) {
      record.line.geometry.dispose();
      (record.line.material as THREE.Material).dispose();
      record.line.removeFromParent();
    }
    this._beams.clear();

    for (const t of this._trails) {
      (t.sprite.material as THREE.SpriteMaterial).dispose();
      t.sprite.removeFromParent();
    }
    this._trails.length = 0;

    for (const sw of this._shockwaves) {
      sw.mesh.geometry.dispose();
      (sw.mesh.material as THREE.Material).dispose();
      sw.mesh.removeFromParent();
    }
    this._shockwaves.length = 0;

    for (const a of this._arcs) {
      a.line.geometry.dispose();
      (a.line.material as THREE.Material).dispose();
      a.line.removeFromParent();
    }
    this._arcs.length = 0;

    this._enemyContainer.removeFromParent();
    this._combatContainer.removeFromParent();
    super.preDestroy();
  }
}
