import * as THREE from "three";
import { ParticleBudget, WorldViewBase, type IInstanceResolver, type IParticleEmitter } from "@gamebyte/gamelabsjs";
import type { IGameAreaView } from "./IGameAreaView";
import { AvoidanceConfig } from "../AvoidanceConfig.js";
import { AvoidanceAssetIds } from "../AvoidanceAssetIds.js";
import { PropulsionEmitter } from "./PropulsionEmitter.js";
import { ExplosionEmitter } from "./ExplosionEmitter.js";

export class GameAreaView extends WorldViewBase implements IGameAreaView {
  private _config: AvoidanceConfig | null = null;
  private _budget: ParticleBudget | null = null;
  private _areaSize = 0;

  // Game area meshes
  private _bgMesh: THREE.Mesh | null = null;
  private readonly _borderMeshes: THREE.Mesh[] = [];

  // Player
  private _playerMesh: THREE.Mesh | null = null;

  // Enemies
  private readonly _enemies = new Map<number, THREE.Mesh>();
  private _enemyTexture: THREE.Texture | null = null;

  // FX
  private _propulsion: PropulsionEmitter | null = null;
  private _explosion: ExplosionEmitter | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(AvoidanceConfig);
    this._budget = resolver.getInstance(ParticleBudget);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const config = this._config!;
    this._areaSize = config.gameAreaSize;
    const size = this._areaSize;
    const halfSize = size / 2;

    // Background plane
    const bgTexture = this.assetLoader.getAsset<THREE.Texture>(AvoidanceAssetIds.Background);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0a1a10 });
    if (bgTexture) {
      bgTexture.wrapS = THREE.RepeatWrapping;
      bgTexture.wrapT = THREE.RepeatWrapping;
      bgTexture.repeat.set(size / 256, size / 256);
      bgMat.map = bgTexture;
      bgMat.color.setHex(0xffffff);
    }
    const bgGeo = new THREE.PlaneGeometry(size, size);
    this._bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this._bgMesh.rotation.x = -Math.PI / 2;
    this._bgMesh.position.set(halfSize, 0, halfSize);
    this.add(this._bgMesh);

    // Border (flat planes on the ground, visible from top-down camera)
    const borderColor = config.gameAreaBorderColor;
    const bw = config.gameAreaBorderWidth;
    const borderMat = new THREE.MeshBasicMaterial({ color: borderColor, side: THREE.DoubleSide });

    const makeBorder = (w: number, h: number, x: number, z: number): void => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, borderMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.05, z);
      this._borderMeshes.push(mesh);
      this.add(mesh);
    };

    // top (along X at z=0), bottom (z=size), left (along Z at x=0), right (x=size)
    makeBorder(size + bw * 2, bw, halfSize, -bw / 2);
    makeBorder(size + bw * 2, bw, halfSize, size + bw / 2);
    makeBorder(bw, size, -bw / 2, halfSize);
    makeBorder(bw, size, size + bw / 2, halfSize);

    // Player mesh
    const playerTexture = this.assetLoader.getAsset<THREE.Texture>(AvoidanceAssetIds.Player);
    const playerMat = new THREE.MeshBasicMaterial({ transparent: true, color: 0xffffff });
    if (playerTexture) playerMat.map = playerTexture;
    else playerMat.color.setHex(0x3cdc50);
    const pSize = config.playerSize;
    const playerGeo = new THREE.PlaneGeometry(pSize, pSize);
    this._playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this._playerMesh.rotation.x = -Math.PI / 2;
    this._playerMesh.position.set(halfSize, 0.02, halfSize);
    this.add(this._playerMesh);

    // Cache enemy texture
    this._enemyTexture = this.assetLoader.getAsset<THREE.Texture>(AvoidanceAssetIds.Enemy) ?? null;

    // Particle FX. Both emitters live in world space (parented to this
    // view, which sits at the world origin) so spawned particles drift
    // freely instead of being dragged along with the player.
    const softTex = this.assetLoader.getAsset<THREE.Texture>(AvoidanceAssetIds.ParticleSoft);
    const sparkTex = this.assetLoader.getAsset<THREE.Texture>(AvoidanceAssetIds.ParticleSpark);
    if (!softTex || !sparkTex) throw new Error("Particle textures missing — check loadAssets order");
    this._propulsion = new PropulsionEmitter(this._budget!, config, softTex);
    this._explosion = new ExplosionEmitter(this._budget!, config, sparkTex);
    this.add(this._propulsion);
    this.add(this._explosion);
  }

  public get propulsionEmitter(): IParticleEmitter {
    if (!this._propulsion) throw new Error("propulsionEmitter accessed before postInitialize");
    return this._propulsion;
  }

  public get explosionEmitter(): IParticleEmitter {
    if (!this._explosion) throw new Error("explosionEmitter accessed before postInitialize");
    return this._explosion;
  }

  public setPropulsionState(vx: number, vy: number): void {
    if (!this._propulsion || !this._config) return;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 1) {
      this._propulsion.setRate(0);
      return;
    }
    const maxSpeed = this._config.playerSpeed;
    const ratio = Math.min(1, speed / maxSpeed);
    this._propulsion.setRate(ratio * this._config.propulsionRateAtMaxSpeed);
    // Eject opposite to motion direction.
    const px = this._playerMesh?.position.x ?? 0;
    const py = this._playerMesh?.position.z ?? 0;
    this._propulsion.setSpawnState(px, py, -vx / speed, -vy / speed);
  }

  public spawnExplosion(x: number, y: number): void {
    if (!this._explosion || !this._config) return;
    this._explosion.burst(x, y, this._config.explosionBurstCount);
  }

  public setPlayerPosition(x: number, y: number): void {
    this._playerMesh?.position.set(x, 0.02, y);
  }

  public addEnemy(id: number, x: number, y: number): void {
    const eSize = this._config!.enemySize;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, color: 0xffffff });
    if (this._enemyTexture) mat.map = this._enemyTexture;
    else mat.color.setHex(0xdc3232);
    const geo = new THREE.PlaneGeometry(eSize, eSize);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, y);
    this._enemies.set(id, mesh);
    this.add(mesh);
  }

  public setEnemyPosition(id: number, x: number, y: number): void {
    const mesh = this._enemies.get(id);
    if (mesh) mesh.position.set(x, 0.02, y);
  }

  public removeEnemy(id: number): void {
    const mesh = this._enemies.get(id);
    if (mesh) {
      this.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
      this._enemies.delete(id);
    }
  }

  public removeAllEnemies(): void {
    for (const [id, mesh] of this._enemies) {
      this.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this._enemies.clear();
  }

  public override preDestroy(): void {
    // Emitters are torn down by the controller (which owns ParticleManager)
    // before this runs, so nothing to do for them here.
    this._propulsion = null;
    this._explosion = null;

    this.removeAllEnemies();

    if (this._playerMesh) {
      this._playerMesh.geometry.dispose();
      (this._playerMesh.material as THREE.MeshBasicMaterial).dispose();
      this._playerMesh = null;
    }
    if (this._bgMesh) {
      this._bgMesh.geometry.dispose();
      (this._bgMesh.material as THREE.MeshBasicMaterial).dispose();
      this._bgMesh = null;
    }
    for (const m of this._borderMeshes) {
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).dispose();
    }
    this._borderMeshes.length = 0;
    this._enemyTexture = null;
    this._config = null;
    this._budget = null;
  }
}
