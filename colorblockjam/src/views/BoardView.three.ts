import * as THREE from "three";
import gsap from "gsap";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  LogTypes,
  World,
  WorldViewBase,
  type IInstanceResolver,
  type IPointerInputHandler,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { ColorBlockJamAssetIds } from "../ColorBlockJamAssetIds.js";
import { ColorBlockJamConfig } from "../ColorBlockJamConfig.js";
import type { DoorSide } from "../constants/BoardTypes.js";
import { resolveBrickAssetId } from "../constants/BrickShapeAssets.js";
import type { Block } from "../models/Block.js";
import type { Door } from "../models/Door.js";
import type { GridPointer, IBoardView } from "./IBoardView.js";

type BlockRecord = {
  readonly id: number;
  readonly block: Block;
  readonly group: THREE.Group;
  /**
   * Every mesh inside the cloned brick model. The whole set receives the
   * block id in `userData` so the raycaster can pick the block through
   * either its body or its studs.
   */
  readonly pickableMeshes: THREE.Mesh[];
  /**
   * Cloned materials on this block. Geometry is shared across every
   * clone of the same GLB (never disposed by the view), but each block
   * gets its own material so it can be tinted independently and have
   * clipping planes / depth flags toggled without leaking into other
   * blocks.
   */
  readonly materials: THREE.MeshStandardMaterial[];
  readonly baseY: number;
  /**
   * True once the exit animation has been started. Prevents the raycaster
   * from picking the mesh again and double-triggering an exit.
   */
  isExiting: boolean;
};

export class BoardView extends WorldViewBase implements IBoardView, IPointerInputHandler {
  private _config: ColorBlockJamConfig | null = null;
  private _world: World | null = null;

  /**
   * Grid dimensions for the level the board is currently rendering. Set
   * by {@link buildBoard}; used for cell positioning and pointer
   * projection regardless of which config level is active.
   */
  private _cols = 0;
  private _rows = 0;

  private _gridPlate: THREE.Mesh | null = null;
  private _gridPlateMaterial: THREE.MeshStandardMaterial | null = null;
  private _gridPlateGeometry: THREE.BoxGeometry | null = null;
  /** One merged LineSegments mesh drawing every grid boundary in a single pass. */
  private _gridOverlay: THREE.LineSegments | null = null;
  private _gridOverlayGeometry: THREE.BufferGeometry | null = null;
  private _gridOverlayMaterial: THREE.LineBasicMaterial | null = null;

  /** Extra key light added to brighten the studs. */
  private _keyLight: THREE.DirectionalLight | null = null;

  /**
   * Per-door records keyed by id. Stores each gate's mesh + its side so
   * `animateExit` can look up exactly which wall the block should be
   * clipped against and which axis to press on the gate. Materials and
   * geometries are held for dispose.
   */
  private readonly _doors = new Map<
    number,
    {
      readonly mesh: THREE.Mesh;
      /** White arrow on top of the gate, animated alongside the button-press. */
      readonly arrowMesh: THREE.Mesh;
      readonly arrowGeometry: THREE.BufferGeometry;
      /** Rest Y of the arrow (gate top + lift). Animated during the press. */
      readonly arrowRestY: number;
      readonly side: DoorSide;
      /** Inclusive cell indices along the gate's span. Used by the
       * particle emitter to spread spawn origins across the full
       * opening instead of a single centre point. */
      readonly spanStart: number;
      readonly spanEnd: number;
      readonly material: THREE.MeshStandardMaterial;
      readonly geometry: THREE.BufferGeometry;
    }
  >();

  /**
   * Neutral-colour walls filling every edge cell that doesn't host a
   * gate. Each wall is an independent mesh + material (random gray) so
   * the border has subtle shade variation; all horizontal walls share
   * one geometry and all vertical walls share another.
   */
  private readonly _walls: Array<{
    readonly mesh: THREE.Mesh;
    readonly material: THREE.MeshStandardMaterial;
  }> = [];
  private _wallGeometryH: THREE.BufferGeometry | null = null;
  private _wallGeometryV: THREE.BufferGeometry | null = null;
  /** Shared arrow material — white, used by every gate arrow. */
  private _gateArrowMaterial: THREE.MeshStandardMaterial | null = null;

  private readonly _blocks = new Map<number, BlockRecord>();

  /**
   * Per-block selection highlight. Added on {@link setBlockSelected}(.., true)
   * and fully disposed on the matching `false` call (or when the block /
   * board is torn down). The outline is built as an inverted-hull shader
   * pass: duplicate meshes push every vertex along its normal by
   * {@link ColorBlockJamConfig.selectionOutlineThickness} so the hull
   * sticks out past the original mesh by a uniform amount on all faces;
   * `side: BackSide` culls the front faces so only the "shell" renders.
   * `depthTest: false` + `renderOrder: 9998` keep the outline painted on
   * top of every other block while the dragged block is re-rendered at
   * `renderOrder: 9999` on top of its own outline — giving a clean white
   * silhouette around the block's live 3D shape regardless of camera
   * angle.
   */
  private readonly _selectionOutlines = new Map<
    number,
    {
      readonly outlineMeshes: THREE.Mesh[];
    }
  >();

  /** Shared outline shader — one allocation for every selected block. */
  private _outlineMaterial: THREE.ShaderMaterial | null = null;

  private _draggedBlockId: number | null = null;
  private _activePointerId: number | null = null;

  private readonly _pickListeners = new Set<(blockId: number, pointer: GridPointer) => void>();
  private readonly _moveListeners = new Set<(pointer: GridPointer) => void>();
  private readonly _upListeners = new Set<(pointer: GridPointer) => void>();

  private readonly _raycaster = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _planeHit = new THREE.Vector3();

  private readonly _activeTimelines = new Set<gsap.core.Timeline>();

  private _skyTexture: THREE.CanvasTexture | null = null;
  private _priorBackground: THREE.Scene["background"] = null;
  private _priorFog: THREE.Scene["fog"] = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(ColorBlockJamConfig);
    this._world = resolver.getInstance(World);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this._installSkyGradient();
    this._installKeyLight();
    // Needed for the per-material `clippingPlanes` used by the exit
    // animation to hide the portion of the block that has crossed the
    // grid edge.
    if (this._world) this._world.renderer.localClippingEnabled = true;
  }

  /**
   * Adds a warm, angled directional light so the Lego studs read as 3D.
   * The framework's scene already has an ambient + overhead directional,
   * which are broad and flat; this extra light comes from upper-front
   * so each stud casts a short lateral highlight. Disposed in preDestroy.
   */
  private _installKeyLight(): void {
    if (!this._world) return;
    const cfg = this._requireConfig();
    const light = new THREE.DirectionalLight(cfg.keyLightColor, cfg.keyLightIntensity);
    light.position.set(cfg.keyLightX, cfg.keyLightY, cfg.keyLightZ);
    light.target.position.set(cfg.keyLightTargetX, cfg.keyLightTargetY, cfg.keyLightTargetZ);
    this._world.scene.add(light);
    this._world.scene.add(light.target);
    this._keyLight = light;
  }

  private _uninstallKeyLight(): void {
    if (!this._world || !this._keyLight) return;
    this._world.scene.remove(this._keyLight);
    this._world.scene.remove(this._keyLight.target);
    this._keyLight = null;
  }

  /**
   * Swaps the shared scene's dark background for a light-orange→deep-blue
   * vertical gradient rendered from a small CanvasTexture. The original
   * background and fog are remembered and restored in {@link preDestroy}
   * so the framework default isn't permanently mutated by this example.
   *
   * Scene setup (background / fog) lives in the view per AGENTS.md — the
   * app class doesn't manage renderer state directly.
   */
  private _installSkyGradient(): void {
    if (!this._world) return;
    const cfg = this._requireConfig();
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, cfg.skyTopColor);
    gradient.addColorStop(cfg.skyMidStop, cfg.skyMidColor);
    gradient.addColorStop(1, cfg.skyBottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    this._skyTexture = texture;

    const scene = this._world.scene;
    this._priorBackground = scene.background;
    this._priorFog = scene.fog;
    scene.background = texture;
    // The framework default is a tight grey fog tuned for the dark clear
    // colour; with a warm gradient sky it would tint blocks grey. Disable.
    scene.fog = null;
  }

  private _uninstallSkyGradient(): void {
    if (!this._world) return;
    const scene = this._world.scene;
    if (this._skyTexture && scene.background === this._skyTexture) {
      scene.background = this._priorBackground;
    }
    if (scene.fog === null && this._priorFog !== null) scene.fog = this._priorFog;
    this._skyTexture?.dispose();
    this._skyTexture = null;
    this._priorBackground = null;
    this._priorFog = null;
  }

  public buildBoard(cols: number, rows: number, doors: readonly Door[]): void {
    this._clearBoard();
    const cfg = this._requireConfig();
    this._cols = cols;
    this._rows = rows;

    const plateW = cols * cfg.cellSize;
    const plateD = rows * cfg.cellSize;
    this._gridPlateGeometry = new THREE.BoxGeometry(plateW, cfg.cellHeight, plateD);
    this._gridPlateMaterial = new THREE.MeshStandardMaterial({
      color: cfg.gridBaseColor,
      metalness: 0.05,
      roughness: 0.9,
    });
    this._gridPlate = new THREE.Mesh(this._gridPlateGeometry, this._gridPlateMaterial);
    this._gridPlate.position.set(0, cfg.cellHeight * 0.5, 0);
    this.add(this._gridPlate);

    this._installGridOverlay(cols, rows);

    for (const door of doors) this._createDoorMesh(door);
    this._installWalls(cols, rows, doors);
  }

  public clearBoard(): void {
    this._clearBoard();
  }

  /**
   * Builds one `LineSegments` covering every horizontal and vertical grid
   * boundary from edge to edge, placed a hair above the plate top so it
   * doesn't z-fight with the plate mesh. Replaces the previous
   * cell-by-cell `EdgesGeometry(BoxGeometry)` which left seams where
   * adjacent boxes' edges coincided exactly in depth.
   */
  private _installGridOverlay(cols: number, rows: number): void {
    const cfg = this._requireConfig();
    const size = cfg.cellSize;
    const halfW = (cols * size) * 0.5;
    const halfD = (rows * size) * 0.5;
    const y = cfg.cellHeight + 0.004;
    const positions: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const z = -halfD + r * size;
      positions.push(-halfW, y, z, halfW, y, z);
    }
    for (let c = 0; c <= cols; c++) {
      const x = -halfW + c * size;
      positions.push(x, y, -halfD, x, y, halfD);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: cfg.gridLineColor });
    const lines = new THREE.LineSegments(geometry, material);
    this.add(lines);
    this._gridOverlay = lines;
    this._gridOverlayGeometry = geometry;
    this._gridOverlayMaterial = material;
  }

  public addBlock(block: Block): void {
    const cfg = this._requireConfig();
    const assetId = resolveBrickAssetId(block.shape);
    if (!assetId) {
      this.logger.log(`BoardView: no brick asset registered for block ${block.id}`, LogTypes.Error);
      throw new Error(`BoardView: no brick asset registered for block ${block.id}`);
    }
    const gltf = this.assetLoader.getAsset<GLTF>(assetId);
    if (!gltf) {
      this.logger.log(`BoardView: missing brick asset ${assetId}`, LogTypes.Error);
      throw new Error(`BoardView: missing brick asset ${assetId}`);
    }

    const color = cfg.colors[block.colorIndex % cfg.colors.length]!;
    const group = gltf.scene.clone(true) as THREE.Group;
    const pickableMeshes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];

    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tinted = this._cloneAsStandardMaterial(mesh.material, color);
      mesh.material = tinted;
      mesh.userData = { ...mesh.userData, blockId: block.id };
      materials.push(tinted);
      pickableMeshes.push(mesh);
    });

    const baseY = cfg.cellHeight;
    group.position.y = baseY;
    this.add(group);

    this._blocks.set(block.id, {
      id: block.id,
      block,
      group,
      pickableMeshes,
      materials,
      baseY,
      isExiting: false,
    });
    this.setBlockAnchor(block.id, block.anchor.col, block.anchor.row);
  }

  /**
   * Clones whatever material the GLB shipped with into a fresh
   * `MeshStandardMaterial` tinted by the block color. Using a uniform
   * material type keeps the selection outline + exit clipping flags
   * consistent regardless of what the exporter produced.
   */
  private _cloneAsStandardMaterial(
    source: THREE.Material | THREE.Material[],
    color: number,
  ): THREE.MeshStandardMaterial {
    const base = Array.isArray(source) ? source[0] : source;
    const standard = (base as THREE.MeshStandardMaterial | undefined) ?? null;
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: standard?.metalness ?? 0.05,
      roughness: standard?.roughness ?? 0.5,
    });
    return material;
  }

  public animateExit(blockId: number, doorId: number, onComplete: () => void): void {
    const record = this._blocks.get(blockId);
    const doorEntry = this._doors.get(doorId);
    if (!record || !doorEntry) {
      onComplete();
      return;
    }
    if (record.isExiting) return;
    record.isExiting = true;

    const cfg = this._requireConfig();
    const side = doorEntry.side;
    const gridHalfW = (this._cols * cfg.cellSize) * 0.5;
    const gridHalfD = (this._rows * cfg.cellSize) * 0.5;

    // Direction the block travels through the gate, and the clip plane
    // that hides the portion that has crossed the grid edge. Plane
    // `normal · p + constant >= 0` stays visible; `< 0` is clipped.
    let outwardX = 0;
    let outwardZ = 0;
    let clipPlane: THREE.Plane;
    switch (side) {
      case "top":
        outwardZ = -1;
        clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), gridHalfD);
        break;
      case "bottom":
        outwardZ = 1;
        clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), gridHalfD);
        break;
      case "left":
        outwardX = -1;
        clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), gridHalfW);
        break;
      case "right":
        outwardX = 1;
        clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), gridHalfW);
        break;
    }

    // Clip block body + studs against the grid edge as they move outward.
    // Every mesh in the cloned brick shares a clip plane through its
    // own cloned material, so the whole brick disappears uniformly as
    // it crosses the wall.
    for (const material of record.materials) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
      material.needsUpdate = true;
    }

    // Kick off the particle burst on the outside of the gate AND the
    // gate's squash-and-spring — both start the instant the match is
    // confirmed, in lockstep with the block's travel tween. The gate's
    // total press duration equals `exitAnimationSeconds` so every
    // phase finishes at the same moment the block is fully consumed.
    this._spawnExitParticles(record, doorEntry, outwardX, outwardZ);
    this._animateGatePress(doorId);

    // Tween the block straight through the gate; clipping does the
    // "shredded by the gate" look — no scale-to-zero needed.
    const distance = cfg.cellSize * cfg.exitAnimationDistanceCells;
    const duration = cfg.exitAnimationSeconds;
    const startX = record.group.position.x;
    const startZ = record.group.position.z;

    const timeline = gsap.timeline({
      onComplete: () => {
        this._activeTimelines.delete(timeline);
        onComplete();
      },
    });
    timeline.to(record.group.position, {
      x: startX + outwardX * distance,
      z: startZ + outwardZ * distance,
      duration,
      ease: "power2.in",
    });
    this._activeTimelines.add(timeline);
  }

  /**
   * Spawns `exitParticlesPerCell` small coloured cubes from **each**
   * occupied cell of the gate's span, so the shred effect covers the
   * full door opening instead of bursting from a single centre point.
   * Each particle tweens outward with a lateral spread + slight
   * vertical arc, and disposes its own geometry/material on completion.
   */
  private _spawnExitParticles(
    record: BlockRecord,
    doorEntry: {
      mesh: THREE.Mesh;
      side: DoorSide;
      spanStart: number;
      spanEnd: number;
    },
    outwardX: number,
    outwardZ: number,
  ): void {
    const cfg = this._requireConfig();
    const color = cfg.colors[record.block.colorIndex % cfg.colors.length]!;
    const size = cfg.exitParticleSize;
    const gateMesh = doorEntry.mesh;
    const isHorizontal = doorEntry.side === "top" || doorEntry.side === "bottom";

    // Tangent unit vector (perpendicular to gate's outward direction)
    // used to scatter particles laterally along the gate's span.
    const lateralX = outwardZ;
    const lateralZ = -outwardX;

    // One origin per occupied cell along the span — centres the spawn
    // at each cell's midpoint on the gate axis, while the perpendicular
    // axis and height stay pinned to the gate's own position.
    const cellCount = doorEntry.spanEnd - doorEntry.spanStart + 1;
    for (let cellIdx = 0; cellIdx < cellCount; cellIdx++) {
      const cellCoord = doorEntry.spanStart + cellIdx;
      const originX = isHorizontal ? this._cellWorld(cellCoord, 0).x : gateMesh.position.x;
      const originZ = isHorizontal ? gateMesh.position.z : this._cellWorld(0, cellCoord).z;
      const originY = cfg.blockHeight * 0.5;

      for (let i = 0; i < cfg.exitParticlesPerCell; i++) {
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.7 });
        const mesh = new THREE.Mesh(geometry, material);
        // Small random offset within the cell so particles don't all
        // stack on the exact cell centre.
        mesh.position.set(
          originX + (Math.random() - 0.5) * 0.35,
          originY + (Math.random() - 0.5) * 0.25,
          originZ + (Math.random() - 0.5) * 0.35,
        );
        this.add(mesh);

        const life = cfg.exitParticleLifetime + Math.random() * cfg.exitParticleLifetimeJitter;
        const speed = cfg.exitParticleSpeed * (0.7 + Math.random() * 0.6);
        const sideJitter = (Math.random() - 0.5) * cfg.exitParticleSpread;
        const upJitter = 0.6 + Math.random() * 0.6;
        const endX = mesh.position.x + outwardX * speed + lateralX * sideJitter;
        const endY = mesh.position.y + upJitter - 0.9;
        const endZ = mesh.position.z + outwardZ * speed + lateralZ * sideJitter;

        const timeline = gsap.timeline({
          onComplete: () => {
            this._activeTimelines.delete(timeline);
            mesh.removeFromParent();
            geometry.dispose();
            material.dispose();
          },
        });
        timeline.to(
          mesh.position,
          { x: endX, y: endY, z: endZ, duration: life, ease: "power1.out" },
          0,
        );
        timeline.to(
          mesh.rotation,
          {
            x: Math.random() * Math.PI * 2,
            z: Math.random() * Math.PI * 2,
            duration: life,
            ease: "none",
          },
          0,
        );
        timeline.to(
          mesh.scale,
          { x: 0, y: 0, z: 0, duration: life * 0.6, ease: "power2.in" },
          life * 0.4,
        );
        this._activeTimelines.add(timeline);
      }
    }
  }

  /**
   * Squashes the gate along its own height (world Y) and springs it back
   * to full height. The mesh origin is at the gate's base (see
   * `_createDoorMesh`) so scaling Y makes the top descend while the
   * base stays planted — identical behaviour for every edge. Total
   * duration equals `exitAnimationSeconds` so it finishes in sync with
   * the block's travel tween.
   */
  private _animateGatePress(doorId: number): void {
    const entry = this._doors.get(doorId);
    if (!entry) return;
    const cfg = this._requireConfig();
    const mesh = entry.mesh;
    const arrow = entry.arrowMesh;

    const total = cfg.exitAnimationSeconds;
    const downFraction = Math.min(0.9, Math.max(0.1, cfg.gatePressDownFraction));
    const downSeconds = total * downFraction;
    const upSeconds = total * (1 - downFraction);

    // Arrow Y tracks the gate's top — otherwise it would hover while
    // the gate squashes down under it.
    const gateHeight = cfg.blockHeight * cfg.gateHeightMultiplier;
    const arrowLift = entry.arrowRestY - gateHeight;
    const pressedArrowY = gateHeight * cfg.gatePressScale + arrowLift;

    const timeline = gsap.timeline({
      onComplete: () => this._activeTimelines.delete(timeline),
    });
    timeline.to(
      mesh.scale,
      { y: cfg.gatePressScale, duration: downSeconds, ease: "power2.in" },
      0,
    );
    timeline.to(
      arrow.position,
      { y: pressedArrowY, duration: downSeconds, ease: "power2.in" },
      0,
    );
    timeline.to(
      mesh.scale,
      { y: 1, duration: upSeconds, ease: "back.out(2.4)" },
      downSeconds,
    );
    timeline.to(
      arrow.position,
      { y: entry.arrowRestY, duration: upSeconds, ease: "back.out(2.4)" },
      downSeconds,
    );
    this._activeTimelines.add(timeline);
  }

  public removeBlock(blockId: number): void {
    const record = this._blocks.get(blockId);
    if (!record) return;
    this._removeSelectionOutline(blockId);
    record.group.removeFromParent();
    // Geometry is shared with the GLB asset and is reused by every
    // clone — only dispose the per-block cloned materials.
    for (const material of record.materials) material.dispose();
    this._blocks.delete(blockId);
  }

  public setBlockAnchor(blockId: number, col: number, row: number): void {
    const record = this._blocks.get(blockId);
    if (!record) return;
    const world = this._anchorWorld(col, row);
    record.group.position.x = world.x;
    record.group.position.z = world.z;
  }

  public setBlockLifted(blockId: number, lifted: boolean): void {
    const cfg = this._requireConfig();
    const record = this._blocks.get(blockId);
    if (!record) return;
    record.group.position.y = record.baseY + (lifted ? cfg.dragLiftAmount : 0);
  }

  public setBlockSelected(blockId: number, selected: boolean): void {
    if (selected) this._addSelectionOutline(blockId);
    else this._removeSelectionOutline(blockId);
  }

  /**
   * Spawns inverted-hull silhouette clones of every pickable mesh on the
   * block (body + studs) and flips the block's own meshes into a "paint
   * on top" state so the outline fringe wraps the block's live 3D shape
   * from every camera angle. Each clone reuses the original geometry
   * unchanged — normals are already defined on it, and the outline
   * shader displaces every vertex outward along its own normal so the
   * expansion is uniform regardless of the footprint shape.
   */
  private _addSelectionOutline(blockId: number): void {
    const record = this._blocks.get(blockId);
    if (!record) return;
    if (this._selectionOutlines.has(blockId)) return;

    const outlineMaterial = this._ensureOutlineMaterial();
    const outlineMeshes: THREE.Mesh[] = [];
    for (const mesh of record.pickableMeshes) {
      const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
      outline.position.copy(mesh.position);
      outline.rotation.copy(mesh.rotation);
      outline.scale.copy(mesh.scale);
      outline.renderOrder = 9998;
      // Attach to the mesh's own parent so the outline's local
      // transform lines up even when the GLB contains nested groups.
      (mesh.parent ?? record.group).add(outline);
      outlineMeshes.push(outline);
    }

    // Re-render the block's own surfaces on top of the outline so the
    // silhouette interior is covered and only the fringe remains visible
    // — and on top of every OTHER block too, matching the always-visible
    // spec when the dragged block is overlapping neighbours.
    for (const material of record.materials) {
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    for (const mesh of record.pickableMeshes) mesh.renderOrder = 9999;

    this._selectionOutlines.set(blockId, { outlineMeshes });
  }

  private _removeSelectionOutline(blockId: number): void {
    const entry = this._selectionOutlines.get(blockId);
    if (!entry) return;
    for (const mesh of entry.outlineMeshes) mesh.removeFromParent();
    this._selectionOutlines.delete(blockId);

    const record = this._blocks.get(blockId);
    if (!record) return;
    for (const material of record.materials) {
      material.depthTest = true;
      material.depthWrite = true;
      material.needsUpdate = true;
    }
    for (const mesh of record.pickableMeshes) mesh.renderOrder = 0;
  }

  /**
   * The outline material is a `ShaderMaterial` that pushes every vertex
   * along its per-vertex normal by `thickness` world units and paints
   * the result white. With `side: BackSide` only the far face of the
   * expanded hull renders, and `depthTest: false` keeps it visible
   * through other blocks. Shared across all selected blocks — one
   * allocation per `BoardView` lifetime.
   */
  private _ensureOutlineMaterial(): THREE.ShaderMaterial {
    if (this._outlineMaterial) return this._outlineMaterial;
    const cfg = this._requireConfig();
    this._outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        thickness: { value: cfg.selectionOutlineThickness },
      },
      vertexShader: [
        "uniform float thickness;",
        "void main() {",
        "  vec3 n = length(normal) > 0.0 ? normalize(normal) : vec3(0.0);",
        "  vec3 displaced = position + n * thickness;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "void main() {",
        "  gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);",
        "}",
      ].join("\n"),
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    return this._outlineMaterial;
  }

  public onBlockPointerDown(cb: (blockId: number, pointer: GridPointer) => void): Unsubscribe {
    this._pickListeners.add(cb);
    return () => this._pickListeners.delete(cb);
  }

  public onDragMove(cb: (pointer: GridPointer) => void): Unsubscribe {
    this._moveListeners.add(cb);
    return () => this._moveListeners.delete(cb);
  }

  public onDragEnd(cb: (pointer: GridPointer) => void): Unsubscribe {
    this._upListeners.add(cb);
    return () => this._upListeners.delete(cb);
  }

  // --- Pointer input ------------------------------------------------------

  public onPointerDown(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedBlockId !== null) return;
    const blockId = this._raycastBlock(event);
    if (blockId === null) return;
    const pointer = this._pointerGrid(event);
    if (!pointer) return;
    this._draggedBlockId = blockId;
    this._activePointerId = event.pointerId;
    for (const cb of this._pickListeners) cb(blockId, pointer);
  }

  public onPointerMove(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedBlockId === null) return;
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    const pointer = this._pointerGrid(event);
    if (!pointer) return;
    for (const cb of this._moveListeners) cb(pointer);
  }

  public onPointerUp(event: PointerEvent, _onThisObject: boolean): void {
    if (this._draggedBlockId === null) return;
    if (this._activePointerId !== null && event.pointerId !== this._activePointerId) return;
    const pointer = this._pointerGrid(event) ?? { col: 0, row: 0 };
    this._draggedBlockId = null;
    this._activePointerId = null;
    for (const cb of this._upListeners) cb(pointer);
  }

  public onPointerCancel(_event: PointerEvent): void {
    if (this._draggedBlockId === null) return;
    const pointer = { col: 0, row: 0 };
    this._draggedBlockId = null;
    this._activePointerId = null;
    for (const cb of this._upListeners) cb(pointer);
  }

  public override preDestroy(): void {
    this._pickListeners.clear();
    this._moveListeners.clear();
    this._upListeners.clear();
    for (const tl of this._activeTimelines) tl.kill();
    this._activeTimelines.clear();
    this._uninstallKeyLight();
    this._uninstallSkyGradient();
    this._clearBoard();
    super.preDestroy();
  }

  // --- Internals ----------------------------------------------------------

  private _cellWorld(col: number, row: number): { x: number; z: number } {
    const cfg = this._requireConfig();
    const centerCol = (this._cols - 1) * 0.5;
    const centerRow = (this._rows - 1) * 0.5;
    return {
      x: (col - centerCol) * cfg.cellSize,
      z: (row - centerRow) * cfg.cellSize,
    };
  }

  /**
   * World position of a block's anchor cell (its shape-(0,0) centre).
   * Accepts floats so the view can render smoothly during a slide.
   */
  private _anchorWorld(col: number, row: number): { x: number; z: number } {
    return this._cellWorld(col, row);
  }

  private _createDoorMesh(door: Door): void {
    const cfg = this._requireConfig();
    const color = cfg.colors[door.colorIndex % cfg.colors.length]!;
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.55 });

    const span = door.spanEnd - door.spanStart + 1;
    const longSide = cfg.cellSize * span * 0.94;
    const shortSide = cfg.edgePieceDepth;
    const height = cfg.blockHeight * cfg.gateHeightMultiplier;
    const halfShort = shortSide * 0.5;
    const gridHalfWidth = (this._cols * cfg.cellSize) * 0.5;
    const gridHalfDepth = (this._rows * cfg.cellSize) * 0.5;

    let widthX = 0;
    let depthZ = 0;
    let x = 0;
    let z = 0;
    let outwardX = 0;
    let outwardZ = 0;

    if (door.side === "top" || door.side === "bottom") {
      widthX = longSide;
      depthZ = shortSide;
      x = this._cellWorld((door.spanStart + door.spanEnd) * 0.5, 0).x;
      z = door.side === "top" ? -gridHalfDepth - halfShort : gridHalfDepth + halfShort;
      outwardZ = door.side === "top" ? -1 : 1;
    } else {
      widthX = shortSide;
      depthZ = longSide;
      z = this._cellWorld(0, (door.spanStart + door.spanEnd) * 0.5).z;
      x = door.side === "left" ? -gridHalfWidth - halfShort : gridHalfWidth + halfShort;
      outwardX = door.side === "left" ? -1 : 1;
    }

    // Rounded body. Origin baked at y = 0 (base) so the button-press
    // animation scales only along Y and the top of the gate descends
    // toward the ground without lifting the base.
    const geometry = this._createRoundedEdgePieceGeometry(widthX, depthZ, height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0, z);
    this.add(mesh);

    // White arrow sitting on top, pointing outward.
    const arrowGeometry = this._createArrowGeometry(outwardX, outwardZ);
    const arrowMesh = new THREE.Mesh(arrowGeometry, this._ensureGateArrowMaterial());
    const arrowRestY = height + cfg.gateArrowLift;
    arrowMesh.position.set(x, arrowRestY, z);
    this.add(arrowMesh);

    this._doors.set(door.id, {
      mesh,
      arrowMesh,
      arrowGeometry,
      arrowRestY,
      side: door.side,
      spanStart: door.spanStart,
      spanEnd: door.spanEnd,
      material,
      geometry,
    });
  }

  /**
   * Rounded-corner box used by both gates and walls. The corners in the
   * XZ plane are quadratic-curve arcs; top/bottom edges get a small
   * bevel so the final silhouette reads as a soft rounded brick. The
   * mesh origin is placed at the base (world y = 0) so Y-scale
   * animations pivot from the floor.
   */
  private _createRoundedEdgePieceGeometry(
    widthX: number,
    depthZ: number,
    height: number,
  ): THREE.BufferGeometry {
    const cfg = this._requireConfig();
    const w = widthX * 0.5;
    const d = depthZ * 0.5;
    const r = Math.max(0, Math.min(cfg.edgePieceCornerRadius, Math.min(w, d) * 0.95));

    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);

    const bevel = Math.min(r * 0.5, height * 0.18);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 3,
      curveSegments: 4,
    });
    // Shape was built in the XY plane. Rotate so extrusion axis maps to
    // world +Y, then the box occupies X ∈ [-w, w], Y ∈ [0, height],
    // Z ∈ [-d, d] — with the origin on the base.
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  /**
   * Builds a flat arrow sitting on the XZ plane pointing along the
   * `outwardX` / `outwardZ` unit vector. Extruded vertically by
   * `gateArrowThickness` so it reads as a solid arrow from any camera
   * angle, including the near-top-down view this game uses.
   */
  private _createArrowGeometry(outwardX: number, outwardZ: number): THREE.BufferGeometry {
    const cfg = this._requireConfig();
    const length = cfg.gateArrowLength;
    const width = cfg.gateArrowWidth;
    const thickness = cfg.gateArrowThickness;

    const shape = new THREE.Shape();
    // Tip on the +X side; base on the -X side. We rotate into the
    // outward direction below.
    shape.moveTo(-length * 0.5, -width * 0.5);
    shape.lineTo(length * 0.5, 0);
    shape.lineTo(-length * 0.5, width * 0.5);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
    });
    // Lie flat: shape XY → world XZ (Y up).
    geometry.rotateX(-Math.PI / 2);
    // Orient the tip (+X) toward the outward direction.
    geometry.rotateY(Math.atan2(-outwardZ, outwardX));
    return geometry;
  }

  private _ensureGateArrowMaterial(): THREE.MeshStandardMaterial {
    if (this._gateArrowMaterial) return this._gateArrowMaterial;
    const cfg = this._requireConfig();
    this._gateArrowMaterial = new THREE.MeshStandardMaterial({
      color: cfg.gateArrowColor,
      metalness: 0.0,
      roughness: 0.4,
    });
    return this._gateArrowMaterial;
  }

  /**
   * Drops a rounded wall block into every edge cell that doesn't host a
   * gate. Shares one geometry for horizontal walls (top/bottom edges)
   * and one for vertical walls (left/right edges); each wall gets its
   * own material with a random colour picked from {@link ColorBlockJamConfig.wallColors}
   * so the border has subtle shade variation.
   */
  private _installWalls(cols: number, rows: number, doors: readonly Door[]): void {
    const cfg = this._requireConfig();
    const cellSize = cfg.cellSize;
    const longCell = cellSize * 0.94;
    const shortSide = cfg.edgePieceDepth;
    const height = cfg.blockHeight * cfg.gateHeightMultiplier;
    const gridHalfW = (cols * cellSize) * 0.5;
    const gridHalfD = (rows * cellSize) * 0.5;
    const halfShort = shortSide * 0.5;

    const covered: Record<DoorSide, Set<number>> = {
      top: new Set<number>(),
      bottom: new Set<number>(),
      left: new Set<number>(),
      right: new Set<number>(),
    };
    for (const door of doors) {
      for (let i = door.spanStart; i <= door.spanEnd; i++) covered[door.side].add(i);
    }

    this._wallGeometryH = this._createRoundedEdgePieceGeometry(longCell, shortSide, height);
    this._wallGeometryV = this._createRoundedEdgePieceGeometry(shortSide, longCell, height);

    const pickColor = (): number => {
      const palette = cfg.wallColors;
      return palette[Math.floor(Math.random() * palette.length)]!;
    };
    const addWall = (geometry: THREE.BufferGeometry, x: number, z: number): void => {
      const material = new THREE.MeshStandardMaterial({
        color: pickColor(),
        metalness: 0.05,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0, z);
      this.add(mesh);
      this._walls.push({ mesh, material });
    };

    // Top + bottom edges: one wall per uncovered column.
    for (let col = 0; col < cols; col++) {
      const x = this._cellWorld(col, 0).x;
      if (!covered.top.has(col)) addWall(this._wallGeometryH, x, -gridHalfD - halfShort);
      if (!covered.bottom.has(col)) addWall(this._wallGeometryH, x, gridHalfD + halfShort);
    }
    // Left + right edges: one wall per uncovered row.
    for (let row = 0; row < rows; row++) {
      const z = this._cellWorld(0, row).z;
      if (!covered.left.has(row)) addWall(this._wallGeometryV, -gridHalfW - halfShort, z);
      if (!covered.right.has(row)) addWall(this._wallGeometryV, gridHalfW + halfShort, z);
    }
  }

  private _raycastBlock(event: PointerEvent): number | null {
    if (!this._world) return null;
    this._setNdcFromEvent(event);
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const meshes: THREE.Mesh[] = [];
    for (const record of this._blocks.values()) {
      if (record.block.cleared || record.isExiting) continue;
      meshes.push(...record.pickableMeshes);
    }
    if (meshes.length === 0) return null;
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const data = hits[0]!.object.userData as { blockId?: number };
    return typeof data.blockId === "number" ? data.blockId : null;
  }

  private _pointerGrid(event: PointerEvent): GridPointer | null {
    if (!this._world) return null;
    this._setNdcFromEvent(event);
    this._raycaster.setFromCamera(this._ndc, this._world.activeCamera);
    const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._planeHit);
    if (!hit) return null;
    const cfg = this._requireConfig();
    const centerCol = (this._cols - 1) * 0.5;
    const centerRow = (this._rows - 1) * 0.5;
    return {
      col: this._planeHit.x / cfg.cellSize + centerCol,
      row: this._planeHit.z / cfg.cellSize + centerRow,
    };
  }

  private _setNdcFromEvent(event: PointerEvent): void {
    if (!this._world) return;
    const canvas = this._world.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _clearBoard(): void {
    for (const entry of this._selectionOutlines.values()) {
      for (const mesh of entry.outlineMeshes) mesh.removeFromParent();
    }
    this._selectionOutlines.clear();
    this._outlineMaterial?.dispose();
    this._outlineMaterial = null;
    for (const record of this._blocks.values()) {
      record.group.removeFromParent();
      // Brick geometry is shared with the GLB asset; only the
      // per-block cloned materials are owned by this view.
      for (const material of record.materials) material.dispose();
    }
    this._blocks.clear();

    for (const entry of this._doors.values()) {
      entry.mesh.removeFromParent();
      entry.arrowMesh.removeFromParent();
      entry.material.dispose();
      entry.geometry.dispose();
      entry.arrowGeometry.dispose();
    }
    this._doors.clear();
    this._gateArrowMaterial?.dispose();
    this._gateArrowMaterial = null;

    for (const wall of this._walls) {
      wall.mesh.removeFromParent();
      wall.material.dispose();
    }
    this._walls.length = 0;
    this._wallGeometryH?.dispose();
    this._wallGeometryH = null;
    this._wallGeometryV?.dispose();
    this._wallGeometryV = null;

    this._gridOverlay?.removeFromParent();
    this._gridOverlay = null;
    this._gridOverlayGeometry?.dispose();
    this._gridOverlayGeometry = null;
    this._gridOverlayMaterial?.dispose();
    this._gridOverlayMaterial = null;

    this._gridPlate?.removeFromParent();
    this._gridPlate = null;
    this._gridPlateGeometry?.dispose();
    this._gridPlateGeometry = null;
    this._gridPlateMaterial?.dispose();
    this._gridPlateMaterial = null;
  }

  private _requireConfig(): ColorBlockJamConfig {
    if (!this._config) throw new Error("BoardView is not initialized");
    return this._config;
  }
}
