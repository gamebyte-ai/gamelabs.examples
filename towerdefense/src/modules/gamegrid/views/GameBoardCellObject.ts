import * as THREE from "three";
import {
  GridCellObject,
  GridCellObjectOptions,
  POINTER_INPUT_LAYER,
  type IAssetManager,
  type IGridObjectListener,
  type IWorldPointerInput,
  type IPointerInputHandler,
  type RectGridPreset,
} from "@gamebyte/gamelabsjs";
import { CellType } from "../../../constants/CellType.js";
import { TowerDefenseConfig } from "../../../TowerDefenseConfig.js";
import type { ILevelState } from "../../../utilities/ILevelState.js";
import { TerrainTextureFactory } from "./TerrainTextureFactory.js";

type HoverCallback = (col: number, row: number, hovered: boolean) => void;

interface CellEnvironment {
  readonly config: TowerDefenseConfig;
  readonly level: ILevelState;
}

/**
 * Terrain-textured cell for the tower defense grid.
 *
 * Each cell type gets a procedural canvas texture from
 * {@link TerrainTextureFactory}: grass for ground, dirt for path, stone
 * for tower cells, etc. Hover feedback uses emissive glow so the
 * texture stays visible.
 *
 * IMPORTANT: `createVisual()` runs during the base-class constructor,
 * before `setEnvironment()` is called. It builds the mesh with a
 * placeholder material; `setEnvironment()` then applies the correct
 * terrain texture and adds spawn/base markers.
 */
export class GameBoardCellObject extends GridCellObject implements IPointerInputHandler {
  private static readonly COLLIDER_THICKNESS = 0.22;
  private static readonly BORDER_INSET = 1;

  /** Per-cell-type heights give the grid subtle depth variation. */
  private static readonly CELL_HEIGHTS: Record<CellType, number> = {
    [CellType.Ground]: 0.10,
    [CellType.Path]:   0.06,
    [CellType.Spawn]:  0.08,
    [CellType.Base]:   0.08,
    [CellType.Tower]:  0.14,
  };
  private static readonly DEFAULT_HEIGHT = 0.12;

  /** Emissive intensity applied on hover — a subtle brightness lift. */
  private static readonly HOVER_EMISSIVE = 0x333333;

  public declare readonly preset: RectGridPreset;

  /**
   * `declare` prevents the ES2022 field-initialiser from overwriting
   * the value that `createVisual()` sets during the base-class
   * constructor.
   */
  private declare _topMesh: THREE.Mesh | null;
  private _env: CellEnvironment | null = null;
  private _marker: THREE.Group | null = null;
  private _cellType: CellType = CellType.Ground;
  private _isHovered = false;
  private _hoverCallback: HoverCallback | null = null;

  public constructor(
    options: GridCellObjectOptions,
    pointerListener: IGridObjectListener,
    inputManager: IWorldPointerInput | null,
    assetManager?: IAssetManager | null,
  ) {
    super(options, pointerListener, inputManager, assetManager);
    // Ensure we're registered for pointer-move events (hover detection).
    if (inputManager) inputManager.addPointerHandler(this);
  }

  /**
   * Called by the GameBoardObjectCreator AFTER construction.
   * Stores the config + level handles and applies the correct terrain.
   */
  public setEnvironment(env: CellEnvironment): void {
    this._env = env;
    this._applyCellType();
  }

  /**
   * Re-reads the cell type from level state and updates visuals.
   * Called after level generation to refresh every cell.
   */
  public updateCellType(): void {
    if (!this._env) return;
    this._applyCellType();
  }

  public setHoverCallback(cb: HoverCallback | null): void {
    this._hoverCallback = cb;
  }

  // ── Cell-type application (terrain + markers) ─────────────────────────

  private _applyCellType(): void {
    const env = this._env!;
    const cellType = env.level.getCellType(this.col, this.row);
    this._cellType = cellType;
    this._isHovered = false;

    // Apply terrain texture + adjust mesh height
    if (this._topMesh) {
      const mat = this._topMesh.material as THREE.MeshStandardMaterial;

      // Path cells use directional textures (straight vs turn) with
      // per-cell rotation so the road aligns with the generated path.
      let texture: THREE.CanvasTexture;
      let meshRotY = 0;
      if (cellType === CellType.Path) {
        const info = env.level.getPathCellInfo(this.col, this.row);
        if (info) {
          texture = info.isTurn
            ? (info.isRightTurn ? TerrainTextureFactory.getPathTurnLeft() : TerrainTextureFactory.getPathTurnRight())
            : TerrainTextureFactory.getPathStraight();
          meshRotY = info.rotation ;
        } else {
          texture = TerrainTextureFactory.getTexture(cellType);
        }
      } else {
        texture = TerrainTextureFactory.getTexture(cellType);
      }

      mat.map = texture;
      mat.color.set(0xffffff);
      mat.emissive.set(0x000000);
      mat.needsUpdate = true;

      // Rebuild geometry if the height changed
      const h = GameBoardCellObject.CELL_HEIGHTS[cellType] ?? GameBoardCellObject.DEFAULT_HEIGHT;
      const inset = GameBoardCellObject.BORDER_INSET;
      const sizeX = this.preset.columnSize * inset;
      const sizeZ = this.preset.rowSize * inset;
      this._topMesh.geometry.dispose();
      this._topMesh.geometry = new THREE.BoxGeometry(sizeX, h, sizeZ);
      this._topMesh.position.setY(h * 0.5 + 0.01);
      this._topMesh.rotation.y = meshRotY;
    }

    // Remove old marker group and dispose its children
    if (this._marker) {
      this._marker.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      this._marker.removeFromParent();
      this._marker = null;
    }

    // Spawn / Base accent marker
    if (cellType === CellType.Spawn || cellType === CellType.Base) {
      this._createAccentMarker(cellType, env.config);
    }

    // Ground decoration (trees, rocks) — only on Ground cells, random chance
    if (cellType === CellType.Ground) {
      this._placeDecoration(env.config);
    }
  }

  /**
   * Builds a thematic 3D marker on spawn / base cells.
   * - **Base**: defensive castle — walled keep with four corner turrets
   *   and a flag.
   * - **Spawn**: enemy fortress — dark stone tower with a glowing portal
   *   ring and spike spires.
   */
  private _createAccentMarker(cellType: CellType, config: TowerDefenseConfig): void {
    const h = GameBoardCellObject.CELL_HEIGHTS[cellType] ?? GameBoardCellObject.DEFAULT_HEIGHT;
    const y0 = h + config.cellElevation;
    const group = new THREE.Group();

    if (cellType === CellType.Base) {
      GameBoardCellObject._buildCastle(group, y0);
    } else {
      GameBoardCellObject._buildFortress(group, y0);
    }

    this.add(group);
    this._marker = group;
  }

  /** Defensive castle — the structure the player is defending. */
  private static _buildCastle(group: THREE.Group, y0: number): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xc8a870, metalness: 0.15, roughness: 0.8 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x6688bb, metalness: 0.25, roughness: 0.6 });

    // Keep (central tower)
    const keep = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.22), stone);
    keep.position.set(0, y0 + 0.175, 0);
    keep.castShadow = true;
    group.add(keep);

    // Keep roof
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 4), roof);
    keepRoof.position.set(0, y0 + 0.42, 0);
    keepRoof.rotation.y = Math.PI / 4;
    keepRoof.castShadow = true;
    group.add(keepRoof);

    // Four corner turrets
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 6), stone);
      turret.position.set(sx * 0.2, y0 + 0.125, sz * 0.2);
      turret.castShadow = true;
      group.add(turret);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.08, 6), roof);
      cap.position.set(sx * 0.2, y0 + 0.29, sz * 0.2);
      group.add(cap);
    }

    // Walls connecting turrets (thin boxes)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb89860, roughness: 0.85 });
    for (const [x, z, w, d] of [[0, -0.2, 0.32, 0.03], [0, 0.2, 0.32, 0.03], [-0.2, 0, 0.03, 0.32], [0.2, 0, 0.03, 0.32]] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), wallMat);
      wall.position.set(x, y0 + 0.06, z);
      group.add(wall);
    }

    // Flag pole + pennant
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), new THREE.MeshStandardMaterial({ color: 0x665544 }));
    pole.position.set(0, y0 + 0.58, 0);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x2266dd, side: THREE.DoubleSide }));
    flag.position.set(0.05, y0 + 0.63, 0);
    group.add(flag);
  }

  /** Enemy fortress — dark spired tower with a glowing portal. */
  private static _buildFortress(group: THREE.Group, y0: number): void {
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x3a2a2a, metalness: 0.2, roughness: 0.75 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 0.7, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

    // Central dark tower
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 8), darkStone);
    tower.position.set(0, y0 + 0.175, 0);
    tower.castShadow = true;
    group.add(tower);

    // Spike spire on top
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a1a, metalness: 0.3, roughness: 0.6 }));
    spire.position.set(0, y0 + 0.45, 0);
    spire.castShadow = true;
    group.add(spire);

    // Flanking spike pillars
    for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
      const px = Math.sin(angle) * 0.22;
      const pz = Math.cos(angle) * 0.22;
      const pillar = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), darkStone);
      pillar.position.set(px, y0 + 0.11, pz);
      pillar.castShadow = true;
      group.add(pillar);
    }

    // Glowing portal ring at the base
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 16), glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, y0 + 0.04, 0);
    group.add(ring);

    // Portal fill (flat disc with glow)
    const portal = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x880000, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    portal.rotation.x = -Math.PI / 2;
    portal.position.set(0, y0 + 0.04, 0);
    group.add(portal);
  }

  // ── Ground decorations ─────────────────────────────────────────────────

  /** ~40% of ground cells get a decoration, seeded by (col,row). */
  private _placeDecoration(config: TowerDefenseConfig): void {
    // Deterministic pseudo-random per cell so decorations are stable
    const seed = (this.col * 7919 + this.row * 104729) & 0xffff;
    const rand = seed / 0xffff;
    if (rand > 0.40) return; // 40% coverage

    const h = GameBoardCellObject.CELL_HEIGHTS[CellType.Ground] ?? GameBoardCellObject.DEFAULT_HEIGHT;
    const y0 = h + config.cellElevation;
    const group = new THREE.Group();

    // Pick decoration type from the seed
    const pick = (seed * 3) % 100;
    if (pick < 30) {
      GameBoardCellObject._buildTree(group, y0, seed);
    } else if (pick < 60) {
      GameBoardCellObject._buildLargeRock(group, y0, seed);
    } else {
      GameBoardCellObject._buildSmallStones(group, y0, seed);
    }

    // Random offset within the cell so they don't sit dead-center
    const ox = ((seed % 37) / 37 - 0.5) * 0.3;
    const oz = (((seed * 13) % 41) / 41 - 0.5) * 0.3;
    group.position.set(ox, 0, oz);

    this.add(group);
    this._marker = group; // reuse marker slot for cleanup
  }

  /** Large tree — trunk + layered foliage cones. Origin at base. */
  private static _buildTree(group: THREE.Group, y0: number, seed: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6a24, roughness: 0.75 });

    const trunkH = 0.65 + (seed % 17) / 17 * 0.1;
    const trunkR = 0.05;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 5), trunkMat);
    trunk.position.set(0, y0 + trunkH * 0.5, 0);
    trunk.castShadow = true;
    group.add(trunk);

    // 2-3 stacked foliage cones (larger at bottom, smaller at top)
    const layers = 2 + (seed % 2);
    for (let i = 0; i < layers; i++) {
      const layerR = 0.50 - i * 0.03;
      const layerH = 0.86 - i * 0.02;
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(layerR, layerH, 6), leafMat);
      foliage.position.set(0, y0 + trunkH + i * 0.08 + layerH * 0.5, 0);
      foliage.castShadow = true;
      group.add(foliage);
    }
  }

  /** Large rock — angular dodecahedron scaled for variety. Origin at base. */
  private static _buildLargeRock(group: THREE.Group, y0: number, seed: number): void {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x667766, metalness: 0.1, roughness: 0.85 });
    const r = 0.08 + (seed % 23) / 23 * 0.06;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    const sy = 0.5 + (seed % 11) / 11 * 0.4;
    rock.scale.set(2, sy, 2);
    rock.position.set(0, y0 + r * sy, 0);
    rock.rotation.y = (seed % 100) / 100 * Math.PI * 2;
    rock.castShadow = true;
    group.add(rock);
  }

  /** Cluster of 2-3 small stones scattered around the cell. Origin at base. */
  private static _buildSmallStones(group: THREE.Group, y0: number, seed: number): void {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, roughness: 0.9 });
    const count = 2 + (seed % 2);
    for (let i = 0; i < count; i++) {
      const r = 0.025 + (((seed + i * 37) % 19) / 19) * 0.025;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stoneMat);
      const sx = ((seed + i * 53) % 31) / 31 * 0.3 - 0.15;
      const sz = ((seed + i * 71) % 29) / 29 * 0.3 - 0.15;
      stone.position.set(sx, y0 + r * 0.6, sz);
      stone.rotation.y = ((seed + i * 11) % 100) / 100 * Math.PI * 2;
      stone.castShadow = true;
      group.add(stone);
    }
  }

  // ── Visual (runs during base-class constructor) ───────────────────────

  protected override createVisual(): void {
    const inset = GameBoardCellObject.BORDER_INSET;
    const sizeX = this.preset.columnSize * inset;
    const sizeZ = this.preset.rowSize * inset;
    const h = GameBoardCellObject.DEFAULT_HEIGHT;

    const geom = new THREE.BoxGeometry(sizeX, h, sizeZ);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.85,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, h * 0.5 + 0.01, 0);
    mesh.receiveShadow = true;
    this.add(mesh);
    this._topMesh = mesh;
  }

  // ── Collider (invisible, for pointer raycasts) ────────────────────────

  protected override createCollider(): void {
    const inset = GameBoardCellObject.BORDER_INSET;
    const geom = new THREE.BoxGeometry(
      this.preset.columnSize * inset,
      GameBoardCellObject.COLLIDER_THICKNESS,
      this.preset.rowSize * inset,
    );
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(0, GameBoardCellObject.COLLIDER_THICKNESS * 0.5, 0);
    mesh.layers.enable(POINTER_INPUT_LAYER);
    this.add(mesh);
  }

  // ── Pointer events ────────────────────────────────────────────────────

  public onPointerDown(event: PointerEvent, onThisObject: boolean): void {
    if (onThisObject) {
      this._pointerListener.onGridCellPointerDown(this.gridId, this.col, this.row, event);
    }
  }

  public onPointerMove(_event: PointerEvent, onThisObject: boolean): void {
    if (onThisObject && !this._isHovered) {
      this._isHovered = true;
      this._setHoverEmissive(true);
      this._hoverCallback?.(this.col, this.row, true);
    } else if (!onThisObject && this._isHovered) {
      this._isHovered = false;
      this._setHoverEmissive(false);
      this._hoverCallback?.(this.col, this.row, false);
    }
  }

  public onPointerUp(_event: PointerEvent, _onThisObject: boolean): void {}
  public onPointerCancel(_event: PointerEvent): void {}

  // ── Helpers ───────────────────────────────────────────────────────────

  private _setHoverEmissive(on: boolean): void {
    if (!this._topMesh) return;
    const mat = this._topMesh.material as THREE.MeshStandardMaterial;
    mat.emissive.set(on ? GameBoardCellObject.HOVER_EMISSIVE : 0x000000);
  }
}
