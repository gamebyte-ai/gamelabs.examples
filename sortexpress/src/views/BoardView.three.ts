import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import { WorldViewBase, World, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IBoardView } from "./IBoardView";
import { SortExpressConfig } from "../SortExpressConfig";
import { ShapeKind, SHAPE_KINDS, createShapeGeometry, codeToKind } from "../constants/Shapes";
import { BoardModel, type BoardCell, type Slot } from "../models/BoardModel";
import { TrailRibbon } from "./TrailRibbon.three";

/** A cell's slot geometry + the item meshes filling it (world/local coords — the
 * view is at the origin with an identity transform), used to hit-test drops, seat
 * placed items, and advance the layers forward after a match. */
interface CellSlots {
  cell: BoardCell;
  cx: number;
  cy: number;
  /** Top surface of the shelf floor — an item's base rests here. */
  floorY: number;
  /** World X of each front slot, by slot index. */
  slotX: number[];
  /** Item meshes, layer-major then slot: `meshes[layer][slot]` (null = gap).
   * Kept in lockstep with `cell.layers` so a shift advances both together. */
  meshes: (THREE.Mesh | null)[][];
}

/** Tracks a placed item's mesh: which cell/layer/slot it occupies (front layer =
 * draggable), plus what it needs to re-render as it advances forward. */
/** One item's state during the shuffle physics swirl (velocity + per-item traits). */
interface ShuffleBody {
  mesh: THREE.Mesh;
  ref: ItemRef;
  /** The slot this item flies back to when the swirl ends. */
  pos: { loc: CellSlots; layer: number; slot: number };
  /** Preferred orbit radius (the item springs toward this within the band). */
  prefR: number;
  /** The item's resting scale (before the shuffle) — shrinks toward this×swallow. */
  baseScale: number;
  vx: number;
  vy: number;
  /** False until the item has popped forward; the physics swirl only steps it
   * once it's clear of the cell walls. */
  inSim: boolean;
  /** Own-axis spin speed (rad/s; 0 = none). */
  selfSpinSpeed: number;
  /** Per-item turbulence phase + frequency (the "wind" wander). */
  phase: number;
  freq: number;
}

interface ItemRef {
  kind: ShapeKind;
  /** Colour variant — matching needs kind AND variant to agree. */
  variant: number;
  loc: CellSlots;
  layer: number;
  slot: number;
  /** Undimmed colour — re-dimmed per layer as the item advances. */
  baseColor: number;
  mat: THREE.MeshStandardMaterial;
}

/**
 * The 3D board: a cabinet grid of compartments, each holding a STACK of layers
 * randomly filled with 1..N objects (gaps left for dragging). This step builds
 * the {@link BoardModel} and renders it — the FRONT layer bright + full size,
 * deeper layers smaller/dimmer behind it. Dragging, matching/pop and the
 * layer-advance are wired next. Centered on the world origin.
 */
export class BoardView extends WorldViewBase implements IBoardView {
  private _config: SortExpressConfig | null = null;
  private _world: World | null = null;
  private _model: BoardModel | null = null;
  /** Player interaction gate — set false on time-out to freeze the board. */
  private _interactive = true;
  /** Debug inspector row of every (kind, variant) (config.debug.showAllShapes). */
  private readonly _allShapes: THREE.Mesh[] = [];
  /** (kind, variant) per inspector mesh (index-aligned with _allShapes). */
  private readonly _allSpecs: { kind: ShapeKind; variant: number }[] = [];
  /** Name labels under each inspector shape (index-aligned with _allShapes). */
  private readonly _labels: THREE.Sprite[] = [];
  /** Orthographic (parallel) camera; frustum sized per-aspect in onResize. */
  private _ortho: THREE.OrthographicCamera | null = null;
  /** Shared geometry per kind (disposed on teardown). */
  private readonly _geoByKind = new Map<ShapeKind, THREE.BufferGeometry>();
  /** Shared invisible pick-fill disc for the torus centre (created lazily). */
  private _fillGeo: THREE.CircleGeometry | null = null;
  private _fillMat: THREE.MeshBasicMaterial | null = null;
  /** Vertical gradient scene background (disposed on teardown). */
  private _bgTexture: THREE.CanvasTexture | null = null;
  /** Shared shelf-shell geometries (back/floor/side) — disposed on teardown. */
  private readonly _frameGeo: THREE.BufferGeometry[] = [];
  private readonly _materials: THREE.Material[] = [];

  // ── Drag-and-drop ──
  /** Front-layer item meshes eligible for dragging (raycast targets). */
  private readonly _draggable: THREE.Mesh[] = [];
  /** Model location per draggable mesh (origin cell + slot), updated on drop. */
  private readonly _itemRef = new Map<THREE.Mesh, ItemRef>();
  /** Per-cell front-slot geometry for drop hit-testing + seating. */
  private readonly _cellSlots: CellSlots[] = [];
  /** Cell footprint (for the drop hit-test rect). */
  private _cellW = 0;
  private _cellH = 0;
  /** DOM element the pointer listeners are attached to (the world canvas). */
  private _pointerTarget: HTMLElement | null = null;
  private readonly _ray = new THREE.Raycaster();
  /** The item currently being dragged, or null. */
  private _dragged: THREE.Mesh | null = null;
  /** pointerId that owns the active drag — move/up from OTHER pointers (a second
   * finger) are ignored so they can't yank the item. */
  private _dragPointerId: number | null = null;
  /** Terminal game-state, decided exactly ONCE (win XOR lose) — the board is the
   * authority so an in-flight match/broom finishes before the result is called. */
  private _won = false;
  private _ended = false;
  /** Set when the countdown hits 0; the loss only fires once nothing is animating. */
  private _timeUp = false;
  /** In-flight match/broom operations that mutate the model asynchronously. While
   * > 0 the time-up loss is deferred (the board may still resolve to a win). */
  private _busy = 0;
  /** True while the shuffle gather→scatter animation is running (blocks re-trigger). */
  private _shuffling = false;
  /** Broom source-cell advances deferred while a shuffle is running (a broom that
   * lands mid-shuffle must NOT shift layers under the shuffle's captured slots). */
  private readonly _pendingBroomAdvance = new Set<CellSlots>();
  /** Cells with an in-flight MATCH animation — excluded from a shuffle so the match
   * finishes independently (its clear/advance can't fight the shuffle). */
  private readonly _matchingLocs = new Set<CellSlots>();
  /** Active physics-swirl state during the shuffle spin phase (stepped in update). */
  private _spin: {
    elapsed: number;
    /** Elapsed at which the free swirl ends and the suck-to-centre begins. */
    pullInStart: number;
    /** Duration of the suck-to-centre (radius→0 + scale down). */
    pullInSeconds: number;
    cx: number;
    cy: number;
    z: number;
    bodies: ShuffleBody[];
  } | null = null;
  private readonly _winListeners = new Set<() => void>();
  private readonly _loseListeners = new Set<() => void>();
  /** Live broom-fly comet trails + their driver tweens (cleared on teardown). */
  private readonly _trails = new Set<TrailRibbon>();
  private readonly _trailTweens = new Set<gsap.core.Animation>();
  /** The cell the drag STARTED from — if its front row empties (we picked its last
   * item and placed it elsewhere), that cell advances its next layer forward. */
  private _dragOriginLoc: CellSlots | null = null;
  /** Cell to test for a 3-of-a-kind match ONCE the just-dropped item finishes
   * easing into its slot — so the collapse plays after placement, not mid-air. */
  private _pendingMatchLoc: CellSlots | null = null;
  /** Where the dragged item eases TOWARD each frame (view-local coords). */
  private readonly _dragTarget = new THREE.Vector3();
  /** The dragged item's resting slot, to lerp back to on release. */
  private readonly _dragHome = new THREE.Vector3();
  /** World-Z of the drag plane the pointer is unprojected onto (item z + liftZ). */
  private _dragPlaneZ = 0;
  /** True while easing back home after release (finalizes when it arrives). */
  private _releasing = false;
  /** Scratch objects reused per pointer event (no per-move allocation). */
  private readonly _dragPlane = new THREE.Plane();
  private readonly _hitPoint = new THREE.Vector3();
  private readonly _planeNormal = new THREE.Vector3(0, 0, 1); // drag plane faces the camera

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(SortExpressConfig);
    this._world = resolver.getInstance(World);
  }

  public override postInitialize(): void {
    super.postInitialize();
    if (this._world) {
      this._bgTexture = this._makeGradientTexture();
      this._world.scene.background = this._bgTexture;
    }
    this._setupCamera();
    this._setupLights();
    const b = this._config!.board;
    // Active kinds (by code) — fall back to all kinds if none resolve.
    const active = b.activeKinds.map(codeToKind).filter((k): k is ShapeKind => k !== null);
    this._model = new BoardModel({
      cols: b.cols,
      rows: b.rows,
      layersPerCell: b.layersPerCell,
      slotsPerLayer: b.slotsPerLayer,
      minPerLayer: b.minPerLayer,
      maxPerLayer: b.maxPerLayer,
      kinds: active.length > 0 ? active : SHAPE_KINDS,
      variants: b.variants, // colour variants per kind that count as distinct items

      setsPerKind: b.setsPerKind,
      level: this._config!.level, // non-empty → overrides the generator
    });
    this._buildBoard();
    if (this._config!.debug.showAllShapes) this._buildAllShapesRow(); // inspector row ON TOP of the board

    // Pointer listeners for drag-and-drop (own raycast against the front layer).
    // Only pointerDOWN sits on the canvas; once a drag starts, move/up/cancel are
    // bound on WINDOW (see _onPointerDown) so the release is caught even if the
    // pointer leaves the canvas — otherwise the item hangs at the drop point.
    const canvas = this._world?.renderer.domElement;
    this._pointerTarget = canvas?.parentElement ?? canvas ?? null;
    this._pointerTarget?.addEventListener("pointerdown", this._onPointerDown);
    // Kill the right-click / long-press context menu over the game.
    this._pointerTarget?.addEventListener("contextmenu", this._onContextMenu);
  }

  /** Suppress the browser context menu (right-click / mobile long-press). */
  private readonly _onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  /** Directional key light + ambient fill + hemisphere (sky/ground) light, all
   * config-driven — added to the view (which lives in the scene), on TOP of the
   * World's dim defaults, so the board reads brightly. */
  private _setupLights(): void {
    // Take FULL control of this view's lighting: the World seeds the scene with a
    // depth fog + an overhead DirectionalLight(3,5,2) — the fog darkens the board
    // by distance and the overhead light makes the bottom rows darker, and NEITHER
    // is reachable from config. Remove both, then add only our own lights so the
    // config's angle/intensity actually govern the look.
    const scene = this._world?.scene;
    if (scene) {
      scene.fog = null;
      for (const child of [...scene.children]) {
        if (child instanceof THREE.Light) scene.remove(child);
      }
    }
    const l = this._config!.light;
    // Directional KEY light — its angle is the direction from `position` to
    // `target` (a parallel light: only the DIRECTION matters, not the distance).
    // Change `light.position` / `light.target` to aim it. Skipped when intensity 0.
    if (l.intensity > 0) {
      const dir = new THREE.DirectionalLight(l.color, l.intensity);
      dir.position.set(l.position.x, l.position.y, l.position.z);
      dir.target.position.set(l.target.x, l.target.y, l.target.z);
      this.add(dir);
      this.add(dir.target);
    }
    if (l.ambientIntensity > 0) this.add(new THREE.AmbientLight(l.ambientColor, l.ambientIntensity));
    if (l.hemiIntensity > 0) this.add(new THREE.HemisphereLight(l.hemiSky, l.hemiGround, l.hemiIntensity));
  }

  /** Build + activate an orthographic camera; the frustum is sized in onResize. */
  private _setupCamera(): void {
    const world = this._world;
    if (!world) return;
    const c = this._config!.camera;
    this._ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this._ortho.position.set(c.position.x, c.position.y, c.position.z);
    this._ortho.lookAt(c.lookAt.x, c.lookAt.y, c.lookAt.z);
    world.setActiveCamera(this._ortho);
  }

  /** Keep the ortho frustum matched to the viewport: the vertical extent lerps
   * with the aspect (clamped per `camera.zoom`) so the board stays framed at the
   * screen edges across phone shapes; the width follows the true aspect so
   * nothing is stretched. (Same approach as Triple Match 3D.) */
  public override onResize(width: number, height: number, _dpr: number): void {
    super.onResize(width, height, _dpr);
    const ortho = this._ortho;
    if (!ortho || width === 0 || height === 0) return;
    const aspect = width / height;
    const z = this._config!.camera.zoom;
    const span = z.maxAspect - z.minAspect;
    const t = span > 0 ? Math.max(0, Math.min(1, (aspect - z.minAspect) / span)) : 0;
    const h = z.frustumAtMin + (z.frustumAtMax - z.frustumAtMin) * t;
    const w = h * aspect;
    ortho.left = -w / 2;
    ortho.right = w / 2;
    ortho.top = h / 2;
    ortho.bottom = -h / 2;
    ortho.updateProjectionMatrix();
    this._layoutAllShapes();
  }

  /** Build the debug inspector: one mesh per kind, full size + brightness, upright
   * (identity rotation). Draggable (added to _draggable) but with NO ItemRef, so a
   * drop finds no cell slot → it just eases back home. Laid out in _layoutAllShapes. */
  private _buildAllShapesRow(): void {
    for (const kind of SHAPE_KINDS) {
      const variants = (this._config!.shapes.colorsPerKind[kind] ?? [0]).length;
      for (let v = 0; v < variants; v++) {
        const mesh = this._makeItem(kind, v, this._itemScale(kind, 0), 1);
        this.add(mesh);
        this._allShapes.push(mesh);
        this._allSpecs.push({ kind, variant: v });
        this._draggable.push(mesh); // pickable; no ItemRef ⇒ drop returns it home
        const label = this._makeLabel(`${kind.charAt(0).toUpperCase() + kind.slice(1)} ${v + 1}`);
        this.add(label);
        this._labels.push(label);
      }
    }
    this._layoutAllShapes();
  }

  /** A camera-facing text sprite (canvas texture) — the shape's name under it. */
  private _makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.45, 1); // world size (w, h)
    return sprite;
  }

  /** Spread the inspector row evenly across the bottom of the screen (projected
   * onto the front-layer plane so it fits the current viewport). */
  private _layoutAllShapes(): void {
    const n = this._allShapes.length;
    if (n === 0 || !this._ortho) return;
    this._ortho.updateMatrixWorld();
    const labelZ = this._config!.board.itemZ;
    for (let i = 0; i < n; i++) {
      const nx = n > 1 ? -0.82 + (1.64 * i) / (n - 1) : 0; // spread across the width
      const p = this._boardPointAtNdc(nx, -0.8); // near the bottom edge
      if (!p) continue;
      this._allShapes[i].position.set(p.x, p.y, this._itemZ(this._allSpecs[i].kind, 0)); // front-aligned
      this._labels[i]?.position.set(p.x, p.y - this._config!.shapes.scale * 0.75, labelZ); // name under it
    }
  }

  /** World (x, y) where the ray through NDC (nx, ny) meets the front-layer plane. */
  private _boardPointAtNdc(nx: number, ny: number): { x: number; y: number } | null {
    if (!this._ortho) return null;
    this._ray.setFromCamera(new THREE.Vector2(nx, ny), this._ortho);
    this._dragPlane.set(this._planeNormal, -this._config!.board.itemZ);
    if (!this._ray.ray.intersectPlane(this._dragPlane, this._hitPoint)) return null;
    return { x: this._hitPoint.x, y: this._hitPoint.y };
  }

  /** Build the vertical gradient background: `edge` at top+bottom, `center` in the
   * middle, `centerSpread` controlling how wide the middle band is. */
  private _makeGradientTexture(): THREE.CanvasTexture {
    const bg = this._config!.background;
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const hex = (c: number): string => "#" + (c & 0xffffff).toString(16).padStart(6, "0");
    const spread = Math.max(0, Math.min(1, bg.centerSpread));
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, hex(bg.edge));
    grad.addColorStop(Math.max(0, 0.5 - spread / 2), hex(bg.center));
    grad.addColorStop(Math.min(1, 0.5 + spread / 2), hex(bg.center));
    grad.addColorStop(1, hex(bg.edge));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /** A centered rounded-rectangle Shape (w × h, corner radius r) — used as the
   * cell frame's outer outline and (as a hole) its inner opening. */
  private _roundedRectShape(w: number, h: number, r: number): THREE.Shape {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    s.moveTo(x + rr, y);
    s.lineTo(x + w - rr, y);
    s.quadraticCurveTo(x + w, y, x + w, y + rr);
    s.lineTo(x + w, y + h - rr);
    s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    s.lineTo(x + rr, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - rr);
    s.lineTo(x, y + rr);
    s.quadraticCurveTo(x, y, x + rr, y);
    return s;
  }

  /** Geometry is shared per kind; build once, reuse across slots. */
  private _geometry(kind: ShapeKind): THREE.BufferGeometry {
    let g = this._geoByKind.get(kind);
    if (!g) {
      g = createShapeGeometry(kind);
      // Per-kind VERTICAL stretch (Y only), baked in BEFORE rotation so it grows
      // along the shape's own upright axis. Uniform mesh scaling downstream
      // (seating, match, advance) then preserves the taller proportion.
      const hy = this._config!.shapes.heightPerKind?.[kind] ?? 1;
      if (hy !== 1) g.scale(1, hy, 1);
      if (kind === ShapeKind.Cube) {
        // Bake the cube's fixed resting angle into its geometry (mesh rotation
        // stays 0, so drag-sway still layers on top + settle resets cleanly).
        const r = this._config!.shapes.cubeRotation;
        const d = Math.PI / 180;
        g.rotateX(r.x * d);
        g.rotateY(r.y * d);
        g.rotateZ(r.z * d);
      }
      g.computeBoundingBox(); // refresh for _bottomExtent / _frontExtent (seating + Z align)
      this._geoByKind.set(kind, g);
    }
    return g;
  }

  private _buildBoard(): void {
    const cfg = this._config!;
    const b = cfg.board;
    if (!this._model) return;
    const cols = this._model.cols;
    const rows = this._model.rows;
    const slots = this._model.slotsPerLayer;

    // Cabinet: compartments (cellWidth × cellHeight) tiled with colGap (X) +
    // rowGap (Y), centered.
    const pitchX = b.cellWidth + b.colGap;
    const pitchY = b.cellHeight + b.rowGap;
    const totalW = cols * b.cellWidth + (cols - 1) * b.colGap;
    const totalH = rows * b.cellHeight + (rows - 1) * b.rowGap;

    // Each cell is an OPEN-FRONT box (a rectangular shelf): back wall + floor +
    // ceiling + side walls, open toward the camera (+Z). Depth = cellDepth; the
    // box spans z ∈ [-cellDepth/2, +cellDepth/2]. Shared geometries + materials.
    const t = b.wallThickness;
    const d = b.cellDepth;
    const w = b.cellWidth;
    const h = b.cellHeight;
    this._cellW = w; // cached for the drop hit-test rect
    this._cellH = h;
    // Cell frame = an EXTRUDED rounded-rect ring: a rounded outer rect with a
    // rounded-rect hole, extruded through the depth. This rounds the frame OUTSIDE
    // *and* the inner opening / side walls (not just the bar edges). Open front +
    // back; a rounded back wall closes the rear.
    const cr = this._config!.board.cornerRadius;
    const outerR = Math.min(cr, Math.min(w, h) / 2 - 0.001);
    const innerR = Math.max(0, Math.min(cr, Math.min(w - 2 * t, h - 2 * t) / 2 - 0.001));
    const outline = this._roundedRectShape(w, h, outerR);
    outline.holes.push(this._roundedRectShape(w - 2 * t, h - 2 * t, innerR));
    // Bevel the extrude so the FRONT/BACK rims (where the flat face meets the inner
    // side walls) are rounded too — otherwise that inner edge reads as a sharp
    // corner. Bevel is kept under half the wall thickness so it stays valid.
    const bevel = Math.min(t * 0.45, cr * 0.6);
    const frameGeo = new THREE.ExtrudeGeometry(outline, {
      depth: Math.max(0.01, d - 2 * bevel),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    // Anchor the cell's FRONT face at a fixed z and let depth grow BACKWARD, so
    // changing cellDepth moves only the back wall (front + items stay put).
    frameGeo.computeBoundingBox();
    const bb = frameGeo.boundingBox!;
    const frontZ = this._cellFrontZ();
    const backZ = frontZ - (bb.max.z - bb.min.z); // frame's rear end
    frameGeo.translate(0, 0, frontZ - bb.max.z); // put the FRONT face at frontZ
    const backGeo = new RoundedBoxGeometry(w, h, t, 3, Math.min(cr, t * 0.49)); // back wall (the "son")
    this._frameGeo.push(frameGeo, backGeo);
    // Frame is emissive too (frameEmissiveIntensity) so lower rows / downward
    // faces don't fall dark under the directional light — even readout everywhere.
    const fe = cfg.light.frameEmissiveIntensity;
    const shellMat = new THREE.MeshStandardMaterial({ color: b.borderColor, emissive: b.borderColor, emissiveIntensity: fe, roughness: 0.85, metalness: 0.0 });
    const backMat = new THREE.MeshStandardMaterial({ color: b.interiorColor, emissive: b.interiorColor, emissiveIntensity: fe, roughness: 0.95, metalness: 0.0 });
    this._materials.push(shellMat, backMat);

    // Optional CEILING recolor: a thin panel overlaid on the top border bar so the
    // top reads differently from the side/bottom frame. Slightly nudged toward the
    // camera so it wins the depth test over the frame's own top-wall faces. Inset
    // horizontally by the outer radius so it doesn't poke past the rounded corners.
    let ceilGeo: THREE.BufferGeometry | null = null;
    let ceilMat: THREE.MeshStandardMaterial | null = null;
    let ceilY = 0;
    let ceilZ = 0;
    if (b.ceilingColor !== null) {
      const frameDepth = bb.max.z - bb.min.z;
      // RECESS the panel behind the frame's front face so it only recolors the
      // INTERIOR ceiling (not the front rim) — its front edge sits `frontGap` back.
      const frontGap = Math.min(0.6, frameDepth * 0.45);
      const panelDepth = Math.max(0.01, frameDepth - frontGap);
      ceilGeo = new THREE.BoxGeometry(Math.max(0.01, w - 2 * outerR), t * 1.08, panelDepth);
      this._frameGeo.push(ceilGeo);
      ceilMat = new THREE.MeshStandardMaterial({ color: b.ceilingColor, emissive: b.ceilingColor, emissiveIntensity: fe, roughness: 0.85, metalness: 0.0 });
      this._materials.push(ceilMat);
      ceilY = h / 2 - t / 2; // centre of the top wall (relative to cell centre)
      ceilZ = backZ + panelDepth / 2; // rear-anchored: front edge is `frontGap` behind the frame front
    }

    const spacing = b.cellWidth * b.itemSpacingFraction;
    for (const cell of this._model.cells) {
      const cx = -totalW / 2 + w / 2 + cell.col * pitchX;
      const cy = totalH / 2 - h / 2 - cell.row * pitchY;

      // Rounded frame ring (open front) + rounded back wall behind it.
      const frame = new THREE.Mesh(frameGeo, shellMat);
      frame.position.set(cx, cy, 0);
      this.add(frame);
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(cx, cy, backZ + t / 2); // at the frame's rear (front-anchored)
      this.add(back);
      if (ceilGeo && ceilMat) {
        const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
        ceiling.position.set(cx, cy + ceilY, ceilZ);
        this.add(ceiling);
      }

      // Objects rest ON the floor's top surface (bottom touches it), against the
      // back — as if placed on the shelf rather than floating centered.
      const floorY = cy - h / 2 + t + b.itemFloorMargin;

      // Slot geometry + per-layer mesh grid — drop hit-test, seating + advance read these.
      const slotX = Array.from({ length: slots }, (_, si) => cx + (si - (slots - 1) / 2) * spacing);
      const meshes: (THREE.Mesh | null)[][] = cell.layers.map(() => new Array<THREE.Mesh | null>(slots).fill(null));
      const cellSlots: CellSlots = { cell, cx, cy, floorY, slotX, meshes };
      this._cellSlots.push(cellSlots);

      // Layers back → FRONT (front drawn last so it sits on top). Every layer's
      // meshes are tracked (for the advance); only the FRONT is draggable.
      for (let li = cell.layers.length - 1; li >= 0; li--) {
        const layer = cell.layers[li];
        for (let si = 0; si < slots; si++) {
          const spec = layer[si];
          if (!spec) continue; // empty gap
          const { kind, variant } = spec;
          const mesh = this._makeItem(kind, variant, this._itemScale(kind, li), this._layerDim(li));
          mesh.position.set(slotX[si], this._seatY(cellSlots, kind, li), this._itemZ(kind, li));
          this.add(mesh);
          meshes[li][si] = mesh;
          this._itemRef.set(mesh, {
            kind,
            variant,
            loc: cellSlots,
            layer: li,
            slot: si,
            baseColor: this._baseColor(kind, variant),
            mat: mesh.material as THREE.MeshStandardMaterial,
          });
          if (li === 0) this._draggable.push(mesh);
        }
      }
    }
  }

  /** The cell frame's FRONT-FACE plane (fixed anchor, just ahead of the front row).
   * cellDepth grows BACKWARD from here; the drag lift is relative to it too. */
  private _cellFrontZ(): number {
    return this._config!.board.itemZ + 0.25;
  }

  /** The FRONT-FACE plane for depth `li` (deeper layers step back by layerDepthZ).
   * Every item's front is aligned to this, whatever its own depth. */
  private _layerZ(li: number): number {
    const b = this._config!.board;
    return b.itemZ - li * b.layerDepthZ;
  }

  /** Item CENTER z for `kind` at depth `li`: pushed back by the kind's own front
   * extent so its FRONT FACE lands on `_layerZ(li)` — so a deep cone and a thin
   * torus in the same row line up at the front (not centre-aligned). */
  private _itemZ(kind: ShapeKind, li: number): number {
    const off = this._config!.shapes.zOffsetPerKind[kind] ?? 0; // per-kind forward/back nudge
    return this._layerZ(li) - this._frontExtent(kind) * this._itemScale(kind, li) + off;
  }

  /** Distance from a kind's centre to its FRONT face (+Z, normalized geometry). */
  private _frontExtent(kind: ShapeKind): number {
    const g = this._geometry(kind);
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox?.max.z ?? 0.5;
  }

  /** Item scale for `kind` at depth `li`: base `scale` × the kind's own
   * `scalePerKind` multiplier × `behindScale` compounded per layer. */
  private _itemScale(kind: ShapeKind, li: number): number {
    const cfg = this._config!;
    const per = cfg.shapes.scalePerKind[kind] ?? 1;
    return cfg.shapes.scale * per * Math.pow(cfg.board.behindScale, li);
  }

  /** Brightness factor at depth `li` (front = 1, compounding `behindDim`). */
  private _layerDim(li: number): number {
    return Math.pow(this._config!.board.behindDim, li);
  }

  /** Y that seats a `kind` at depth `li` with its base on the shelf floor. */
  private _seatY(loc: CellSlots, kind: ShapeKind, li: number): number {
    return loc.floorY + this._bottomExtent(kind) * this._itemScale(kind, li);
  }

  /** Distance from a kind's center to its BOTTOM (unit geometry), so its base
   * can be seated on the cell floor. */
  private _bottomExtent(kind: ShapeKind): number {
    const g = this._geometry(kind);
    if (!g.boundingBox) g.computeBoundingBox();
    return -(g.boundingBox?.min.y ?? -0.5);
  }

  private _makeItem(kind: ShapeKind, variant: number, scale: number, dim: number): THREE.Mesh {
    const cfg = this._config!;
    const color = this._dim(this._baseColor(kind, variant), dim);
    // Emissive (self-lit) so an item reads its full colour EVENLY regardless of
    // light direction — the scene's directional light (incl. the World's default
    // from above) can't darken one side/row. Uses the (per-layer dimmed) colour so
    // back layers still fade. `emissiveIntensity` = how flat/even (1 ≈ unlit).
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: cfg.shapes.emissiveIntensity,
      roughness: cfg.shapes.roughness,
      metalness: cfg.shapes.metalness,
    });
    this._materials.push(mat);
    const mesh = new THREE.Mesh(this._geometry(kind), mat);
    mesh.scale.setScalar(scale);
    // The torus has a HOLE in the middle → a click through its centre misses the
    // geometry. Add an invisible disc filling the whole ring (child, so it scales
    // with the mesh) purely as a pick target; picking resolves it up to the mesh.
    if (kind === ShapeKind.Torus) mesh.add(this._makeTorusPickFill(kind));
    return mesh;
  }

  /** Invisible disc covering the torus's full circle — a raycast pick target that
   * fills the centre hole. Not rendered (colorWrite/depthWrite off). */
  private _makeTorusPickFill(kind: ShapeKind): THREE.Mesh {
    if (!this._fillGeo) {
      const g = this._geometry(kind);
      if (!g.boundingBox) g.computeBoundingBox();
      const r = g.boundingBox?.max.x ?? 0.5; // torus outer radius (normalized, XY plane)
      this._fillGeo = new THREE.CircleGeometry(r, 24);
      this._fillMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      this._materials.push(this._fillMat);
    }
    return new THREE.Mesh(this._fillGeo, this._fillMat!);
  }

  /** The (undimmed) colour of a (kind, variant) — from config.shapes.colorsPerKind. */
  private _baseColor(kind: ShapeKind, variant: number): number {
    const cols = this._config!.shapes.colorsPerKind[kind] ?? [0xffffff];
    return cols[variant % cols.length] ?? 0xffffff;
  }

  /** Darken a hex color by factor `f` (1 = unchanged) — used to fade back layers. */
  private _dim(hex: number, f: number): number {
    if (f >= 1) return hex;
    const r = Math.round(((hex >> 16) & 0xff) * f);
    const g = Math.round(((hex >> 8) & 0xff) * f);
    const bl = Math.round((hex & 0xff) * f);
    return (r << 16) | (g << 8) | bl;
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  // The picked front-layer item follows the pointer via a per-frame lerp (driven
  // by the controller's UpdateManager tick). The view sits at the world origin
  // with an identity transform, so its local space == world space — the raycast
  // (world) results are used directly as local item positions.

  private readonly _onPointerDown = (event: PointerEvent): void => {
    if (!this._interactive) return; // frozen (e.g. after time-out)
    if (event.button !== 0) return; // primary button only — ignore right/middle click
    // A previous drop may still be easing into its slot — snap it home/seated NOW
    // so it isn't abandoned mid-flight (left hanging) when this new drag takes over.
    if (this._dragged && this._releasing) this._settleRelease();
    if (this._dragged) return; // a drag is active (incl. a SECOND finger) — ignore
    const picked = this._pickDraggable(event);
    if (!picked) return;
    this._dragged = picked;
    this._dragPointerId = event.pointerId; // this pointer owns the drag
    this._releasing = false;
    this._dragHome.copy(picked.position);
    // Lift to a plane IN FRONT of the cabinet's (front-anchored) front face + liftZ,
    // so a picked item clears the shelf frames while dragged. Independent of
    // cellDepth (the front is fixed; depth grows backward).
    this._dragPlaneZ = this._cellFrontZ() + this._config!.drag.liftZ;
    // Vacate the origin slot (model + mesh grid) NOW so it's a valid drop target
    // too (dropping back onto itself is allowed); restored on an invalid drop.
    const ref = this._itemRef.get(picked);
    this._dragOriginLoc = ref?.loc ?? null;
    if (ref) {
      ref.loc.cell.layers[ref.layer][ref.slot] = null;
      ref.loc.meshes[ref.layer][ref.slot] = null;
    }
    // Seed the target at the lifted home, then refine from the pointer.
    this._dragTarget.set(picked.position.x, picked.position.y, this._dragPlaneZ);
    this._updateDragTarget(event);
    // Track move/release on WINDOW for the duration of the drag (robust to the
    // pointer leaving the canvas — capture-independent).
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (!this._dragged || this._releasing) return;
    if (event.pointerId !== this._dragPointerId) return; // ignore a second finger
    this._updateDragTarget(event);
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    // Only the pointer that owns the drag ends it — a second finger lifting must
    // not drop the item.
    if (event.pointerId !== this._dragPointerId) return;
    const m = this._dragged;
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    this._dragPointerId = null;
    if (!m) return;
    const ref = this._itemRef.get(m);
    // Hit-test where the pointer is OVER THE BOARD (project onto the front-layer
    // plane) — not the item's lifted drag-plane position, whose z-parallax under
    // the tilted camera would land it in the wrong cell / in mid-air. Placement is
    // only ever into a cell's empty front slot; anything else eases back home.
    const p = ref ? this._pointerBoardPoint(event) : null;
    const target = p ? this._dropTargetAt(p.x, p.y) : null;
    if (ref && target) {
      // A fully-cleared cell has no front layer — create an empty one so items can
      // be placed into it (it becomes a usable, sortable row again).
      if (!target.loc.cell.layers[0]) {
        const n = target.loc.slotX.length;
        target.loc.cell.layers.unshift(new Array<Slot>(n).fill(null));
        target.loc.meshes.unshift(new Array<THREE.Mesh | null>(n).fill(null));
      }
      // Drop into the empty FRONT slot → sort. Fill the model + mesh grid + ref.
      target.loc.cell.layers[0][target.slot] = { kind: ref.kind, variant: ref.variant };
      target.loc.meshes[0][target.slot] = m;
      const originLoc = this._dragOriginLoc;
      ref.loc = target.loc;
      ref.layer = 0;
      ref.slot = target.slot;
      this._dragTarget.copy(this._restPos(target.loc, target.slot, ref.kind));
      // SOURCE cell: if that was its last front item (front row now empty), advance
      // its next layer forward. (No-op when dropped back into the same cell.)
      if (originLoc && originLoc !== target.loc) this._advanceIfFrontEmpty(originLoc);
      // Defer the 3-of-a-kind check until the item has EASED into its slot — the
      // collapse plays only AFTER placement completes (fired in update()).
      this._pendingMatchLoc = target.loc;
    } else if (ref) {
      // Invalid drop → restore the origin slot (model + grid) + ease back home.
      ref.loc.cell.layers[ref.layer][ref.slot] = { kind: ref.kind, variant: ref.variant };
      ref.loc.meshes[ref.layer][ref.slot] = m;
      this._dragTarget.copy(this._dragHome);
    } else {
      this._dragTarget.copy(this._dragHome);
    }
    this._releasing = true;
  };

  /** Rest position (view-local) of a seated FRONT-layer item of `kind` in a slot:
   * centered on the slot X, base on the shelf floor, at the front-layer Z. */
  private _restPos(loc: CellSlots, slot: number, kind: ShapeKind): THREE.Vector3 {
    return new THREE.Vector3(loc.slotX[slot], this._seatY(loc, kind, 0), this._itemZ(kind, 0));
  }

  /** The empty front slot to drop onto for a pointer/item at (x, y): the nearest
   * empty front slot of the cell whose footprint contains (x, y), or null (the
   * point is outside every cell, or that cell's front row is full). */
  private _dropTargetAt(x: number, y: number): { loc: CellSlots; slot: number } | null {
    const hw = this._cellW / 2;
    const hh = this._cellH / 2;
    for (const loc of this._cellSlots) {
      if (x < loc.cx - hw || x > loc.cx + hw || y < loc.cy - hh || y > loc.cy + hh) continue;
      // front === undefined → the cell is fully cleared: EVERY slot is open (a
      // fresh front layer is created on placement). Otherwise only empty slots.
      const front = loc.cell.layers[0];
      let best = -1;
      let bestD = Infinity;
      for (let si = 0; si < loc.slotX.length; si++) {
        if (front && front[si] !== null) continue; // occupied
        const dx = Math.abs(x - loc.slotX[si]);
        if (dx < bestD) {
          bestD = dx;
          best = si;
        }
      }
      return best >= 0 ? { loc, slot: best } : null; // inside this cell — no other cell applies
    }
    return null;
  }

  // ── Match + advance ─────────────────────────────────────────────────────────

  /** If the cell's FRONT row is a full 3 of the SAME kind AND colour, play the
   * match animation (rise + converge to centre + shrink → vanish) then clear the
   * row and advance the layer behind forward. Returns true if a match started. */
  private _tryMatchAndAdvance(loc: CellSlots): boolean {
    const front = loc.cell.layers[0];
    if (!front) return false; // cell fully cleared — nothing to match
    const k0 = front[0];
    if (!k0 || !front.every((s) => s !== null && s.kind === k0.kind && s.variant === k0.variant)) {
      return false; // not a full row of one (kind + colour)
    }
    const meshes = loc.meshes[0].filter((m): m is THREE.Mesh => m !== null);
    if (meshes.length === 0) return false;
    // Out of interaction immediately (removed from the model on advance).
    for (const mesh of meshes) {
      this._removeDraggable(mesh);
      this._itemRef.delete(mesh);
    }
    const mc = this._config!.match;
    const centerSlot = Math.floor(loc.slotX.length / 2);
    const centerX = loc.slotX[centerSlot] ?? loc.cx;
    const rise = mc.riseSeconds;
    const converge = mc.convergeSeconds;
    const arc = (mc.arcTiltDeg * Math.PI) / 180;
    this._beginOp(); // async model mutation until the clear (below) runs
    this._matchingLocs.add(loc); // exclude this cell from a shuffle until it settles
    const tl = gsap.timeline({
      onComplete: () => {
        this._clearFrontAndAdvance(loc, meshes);
        this._endOp();
      },
    });
    // The centre item's risen height (its own base Y + full lift) — the outer two
    // converge to this X *and* Y, climbing to meet it.
    const centerMesh = loc.meshes[0][centerSlot];
    const centerTargetY = (centerMesh?.position.y ?? loc.cy) + mc.liftY + mc.centerExtraLiftY;
    // Iterate by SLOT so we know each item's side (left/centre/right) for the arc.
    loc.meshes[0].forEach((mesh, slot) => {
      if (!mesh) return;
      const s0 = mesh.scale.x; // resting scale — grow/shrink are relative to this
      const sign = slot < centerSlot ? 1 : slot > centerSlot ? -1 : 0; // left +, right −
      const theta = sign * arc; // this item's roll (0 for the centre)
      // Phase 1a — RISE IN PLACE: lift straight up at the item's own slot (no
      // overlap yet) while rolling to its target arc angle. Only the CENTRE item
      // scales up; the outer two keep their size.
      const lift = mc.liftY + (sign === 0 ? mc.centerExtraLiftY : 0); // centre rises higher
      tl.to(mesh.position, { y: mesh.position.y + lift, duration: rise, ease: "power2.out" }, 0);
      if (sign === 0) {
        const up = s0 * mc.convergeScale;
        tl.to(mesh.scale, { x: up, y: up, z: up, duration: rise, ease: "power2.out" }, 0);
        // Bring the centre item toward the camera so it stays IN FRONT of the outer
        // two once they converge onto it.
        if (mc.centerFrontZ !== 0) tl.to(mesh.position, { z: mesh.position.z + mc.centerFrontZ, duration: rise, ease: "power2.out" }, 0);
      }
      if (theta !== 0) tl.to(mesh.rotation, { z: theta, duration: rise, ease: "power2.out" }, 0);
      // Phase 1b — CONVERGE: after the rise, the outer items slide toward the
      // centre item's POSITION (its X *and* its higher Y), climbing to meet it,
      // while rolling their tilt back to upright (0). The centre item holds.
      if (sign !== 0) {
        tl.to(mesh.position, { x: centerX, y: centerTargetY, duration: converge, ease: "power2.inOut" }, rise);
        if (theta !== 0) tl.to(mesh.rotation, { z: 0, duration: converge, ease: "power2.inOut" }, rise);
      }
      // Phase 2 — SHRINK, after the converge.
      const end = s0 * mc.endScale;
      tl.to(mesh.scale, { x: end, y: end, z: end, duration: mc.shrinkSeconds, ease: "power2.in" }, rise + converge);
    });
    // Phase 3: a burst from the centre once shrunk; hold the timeline for its
    // duration so the advance (onComplete) fires after the flash finishes.
    const flashColor = mc.flash.color !== 0 ? mc.flash.color : this._baseColor(k0.kind, k0.variant);
    const flashAt = rise + converge + mc.shrinkSeconds;
    tl.call(() => {
      for (const mesh of meshes) mesh.visible = false; // hide the shrunk dots — the flash takes over
      this._spawnFlash(centerX, loc.cy, flashColor);
    }, [], flashAt);
    tl.to({}, { duration: mc.flash.seconds }, flashAt);
    return true;
  }

  /** A bright disc that bursts from (x, y) — expands to `flash.maxScale` while
   * fading out — the match's centre-outward flash. Self-removes when done. */
  private _spawnFlash(x: number, y: number, color: number): void {
    const f = this._config!.match.flash;
    const geo = new THREE.CircleGeometry(1, 32); // unit disc in XY, faces the camera (+Z)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: f.opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const flash = new THREE.Mesh(geo, mat);
    flash.position.set(x, y, this._layerZ(0) + f.z); // in front of the items
    flash.scale.setScalar(0.01);
    this.add(flash);
    gsap.to(flash.scale, { x: f.maxScale, y: f.maxScale, z: f.maxScale, duration: f.seconds, ease: "power2.out" });
    gsap.to(mat, {
      opacity: 0,
      duration: f.seconds,
      ease: "power2.out",
      onComplete: () => {
        this.remove(flash);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** If a cell's FRONT row is now completely empty (its last item was dragged
   * out), drop that empty layer and advance the layer behind forward. */
  private _advanceIfFrontEmpty(loc: CellSlots): boolean {
    if (loc.cell.layers.length === 0) return false;
    if (loc.cell.layers[0].some((k) => k !== null)) return false; // still has items
    this._clearFrontAndAdvance(loc, []); // no matched meshes — just drop the empty layer + advance
    return true;
  }

  /** Remove the matched (front) meshes + layer, then slide every remaining layer
   * one step forward (grow + brighten to its new depth); the new front row becomes
   * draggable once it arrives. */
  private _clearFrontAndAdvance(loc: CellSlots, matched: THREE.Mesh[]): void {
    for (const mesh of matched) {
      this.remove(mesh);
      (mesh.material as THREE.Material).dispose(); // geometry is shared — keep it
    }
    loc.cell.layers.shift(); // drop the cleared front layer …
    loc.meshes.shift(); //      … from the mesh grid in lockstep
    const dur = this._config!.match.advanceSeconds;
    const tl = gsap.timeline({
      onComplete: () => {
        for (const mesh of loc.meshes[0] ?? []) if (mesh) this._draggable.push(mesh);
        this._matchingLocs.delete(loc); // cell settled — a shuffle may include it again
      },
    });
    loc.meshes.forEach((layerMeshes, li) => {
      for (const mesh of layerMeshes) {
        if (!mesh) continue;
        const ref = this._itemRef.get(mesh);
        if (ref) ref.layer = li;
        const kind = ref?.kind ?? null;
        const s = kind ? this._itemScale(kind, li) : mesh.scale.x; // per-kind scale at the new depth
        const z = kind ? this._itemZ(kind, li) : mesh.position.z; // front-aligned per-kind
        tl.to(mesh.position, { z, y: kind ? this._seatY(loc, kind, li) : mesh.position.y, duration: dur, ease: "power2.out" }, 0);
        tl.to(mesh.scale, { x: s, y: s, z: s, duration: dur, ease: "power2.out" }, 0);
        // Brighten from the old depth's dim to the new one (tween a scalar → tint).
        if (ref) {
          const d = { v: this._layerDim(li + 1) };
          tl.to(d, {
            v: this._layerDim(li),
            duration: dur,
            onUpdate: () => {
              const c = this._dim(ref.baseColor, d.v);
              ref.mat.color.setHex(c);
              ref.mat.emissive.setHex(c);
            },
          }, 0);
        }
      }
    });
    this._resolveEndState();
  }

  /**
   * SHUFFLE booster (mechanic): collect EVERY placed item (all cells + all depth
   * layers) and its occupied slot, then randomly redistribute the items across
   * those SAME slots (a permutation). Each item is re-seated to its new slot's
   * position/scale/dim (which depend on its new depth layer), and the front layer
   * is rebuilt as the draggable set. Slots that were empty stay empty. Returns
   * false if there's nothing to shuffle / the board is busy.
   *
   * NOTE: this is the mechanic only — items snap to their new slots. The magic-hat
   * gather/spin choreography is layered on next.
   */
  public activateShuffle(): boolean {
    // No-op while ANY operation is in flight (a match OR a broom OR another
    // shuffle) — the fan does nothing until the board settles.
    if (this._busy > 0 || this._matchingLocs.size > 0) return false;
    if (!this._interactive || this._dragged || this._shuffling || !this._config || !this._model) return false;
    // Collect the LIVE items via _itemRef (not the grid) so items being removed by
    // an in-flight match/broom are naturally excluded; also skip any cell that has
    // a running match so it finishes independently.
    const positions: { loc: CellSlots; layer: number; slot: number }[] = [];
    const meshes: THREE.Mesh[] = [];
    for (const [mesh, ref] of this._itemRef) {
      if (this._matchingLocs.has(ref.loc)) continue;
      positions.push({ loc: ref.loc, layer: ref.layer, slot: ref.slot });
      meshes.push(mesh);
    }
    if (meshes.length < 2) return false;
    // Fisher–Yates shuffle → meshes[i] will end at positions[i] (a permutation).
    for (let i = meshes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [meshes[i], meshes[j]] = [meshes[j], meshes[i]];
    }

    // Freeze input + mark busy (so a time-up defers until the shuffle settles).
    this._shuffling = true;
    this.setInteractive(false);
    this._draggable.length = 0;
    this._beginOp();

    const a = this._config.booster.shuffleAnim;
    const g = a.gather;
    const sp = a.spin;

    // Each item pops STRAIGHT forward (staggered, so it's independent), then hands
    // off to the physics swirl — whose radial spring also pulls it inward, so the
    // gather itself is physics-driven + organic (no rigid tween to the ring).
    const bodies: ShuffleBody[] = [];
    meshes.forEach((mesh, i) => {
      const pos = positions[i];
      const ref = this._itemRef.get(mesh);
      if (!ref) return;
      const prefR = sp.radiusMin + Math.random() * Math.max(0, sp.radiusMax - sp.radiusMin);
      const selfSpinSpeed =
        Math.random() < sp.selfSpinChance
          ? (Math.random() < 0.5 ? -1 : 1) *
            (sp.selfSpinSpeedMin + Math.random() * Math.max(0, sp.selfSpinSpeedMax - sp.selfSpinSpeedMin))
          : 0;
      const body: ShuffleBody = {
        mesh,
        ref,
        pos,
        prefR,
        baseScale: mesh.scale.x,
        vx: 0,
        vy: 0,
        inSim: false,
        selfSpinSpeed,
        phase: Math.random() * Math.PI * 2,
        freq: 0.6 + Math.random() * 1.4,
      };
      bodies.push(body);

      // On a per-item random delay (staggered start), hand the item to the physics
      // swirl — which eases it FORWARD (z) and circulates it AT THE SAME TIME, so it
      // comes out while already spinning (no separate pop-then-spin).
      const delay = Math.random() * a.popStagger;
      gsap.delayedCall(delay, () => {
        const rx = mesh.position.x - g.x;
        const ry = mesh.position.y - g.y;
        const d = Math.hypot(rx, ry) || 1;
        body.vx = (-ry / d) * sp.initialSpeed; // tangential kick
        body.vy = (rx / d) * sp.initialSpeed;
        body.inSim = true;
        // Out of the shelf into the light: brighten from its (possibly dimmed,
        // back-layer) tint up to FULL colour as it comes forward.
        const dim = { v: this._layerDim(ref.layer) };
        gsap.to(dim, {
          v: 1,
          duration: 0.3,
          ease: "power2.out",
          onUpdate: () => {
            const c = this._dim(ref.baseColor, dim.v);
            ref.mat.color.setHex(c);
            ref.mat.emissive.setHex(c);
          },
        });
      });
    });

    // Free swirl ends (and the suck-to-centre begins) once the last item has had
    // its full swirl; the suck then runs for pullInSeconds before placement.
    const pullInStart = a.popStagger + sp.seconds;
    this._spin = { elapsed: 0, pullInStart, pullInSeconds: sp.pullInSeconds, cx: g.x, cy: g.y, z: g.z, bodies };
    gsap.delayedCall(pullInStart + sp.pullInSeconds, () => this._finishSpin());
    return true;
  }

  /** Per-frame physics for the shuffle swirl: a tangential swirl force circulates
   * each item, a radial spring holds it near its preferred radius, and per-item
   * turbulence adds wind-like wander. Runs for `spin.seconds`, then scatters. */
  private _stepSpin(dt: number): void {
    const s = this._spin;
    if (!s || !this._config) return;
    const sp = this._config.booster.shuffleAnim.spin;
    s.elapsed += dt;
    const damp = Math.pow(Math.max(0, Math.min(1, sp.damping)), dt); // velocity kept this frame
    const zk = 1 - Math.exp(-6 * dt); // smooth z-ease toward the swirl plane
    // Phase split: free swirl until `pullInStart`, then a suck-to-centre where the
    // target radius collapses to `endRadius`, the item scales down (swallowed), and
    // the swirl/turbulence fade so it's a clean pull.
    const pull = Math.max(0, Math.min(1, (s.elapsed - s.pullInStart) / Math.max(0.001, s.pullInSeconds)));
    const e = pull * pull * (3 - 2 * pull); // smoothstep
    for (const b of s.bodies) {
      if (!b.inSim) continue; // still popping forward — physics hasn't grabbed it yet
      const targetR = b.prefR + (sp.endRadius - b.prefR) * e;
      const swirlF = sp.swirl * (1 - e); // swirl fades out as it's sucked in
      const turbF = sp.turbulence * (1 - e);
      const springF = sp.spring * (1 + 2 * e); // ...spring tightens to snap to centre
      const rx = b.mesh.position.x - s.cx;
      const ry = b.mesh.position.y - s.cy;
      const d = Math.hypot(rx, ry) || 1e-3;
      const nx = rx / d;
      const ny = ry / d;
      let ax = -ny * swirlF + nx * springF * (targetR - d);
      let ay = nx * swirlF + ny * springF * (targetR - d);
      ax += Math.sin(s.elapsed * b.freq + b.phase) * turbF;
      ay += Math.cos(s.elapsed * b.freq * 1.3 + b.phase) * turbF;
      b.vx = (b.vx + ax * dt) * damp;
      b.vy = (b.vy + ay * dt) * damp;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += (s.z - b.mesh.position.z) * zk; // ease forward to the swirl plane
      if (b.selfSpinSpeed !== 0) b.mesh.rotation.y += b.selfSpinSpeed * dt;
      if (pull > 0) {
        // Guaranteed pull to the CENTRE: blend position toward the hat by `e`
        // (smoothstep) so at e=1 it sits EXACTLY at the centre — overriding any
        // leftover orbital velocity — + scale down toward `swallowScale`.
        b.mesh.position.x += (s.cx - b.mesh.position.x) * e;
        b.mesh.position.y += (s.cy - b.mesh.position.y) * e;
        if (e >= 1) {
          b.vx = 0;
          b.vy = 0;
        }
        const sc = b.baseScale * (1 + (sp.swallowScale - 1) * e);
        b.mesh.scale.setScalar(sc);
      }
    }
  }

  /** End the swirl: fly every item FAST to its new (permuted) slot — re-seating the
   * model + transform — then re-enable play once they all land. */
  private _finishSpin(): void {
    const s = this._spin;
    if (!s || !this._config) return;
    this._spin = null;
    const a = this._config.booster.shuffleAnim;
    const total = s.bodies.length;
    let done = 0;
    for (const b of s.bodies) {
      const { mesh, ref, pos } = b;
      ref.loc = pos.loc;
      ref.layer = pos.layer;
      ref.slot = pos.slot;
      pos.loc.cell.layers[pos.layer][pos.slot] = { kind: ref.kind, variant: ref.variant };
      pos.loc.meshes[pos.layer][pos.slot] = mesh;
      const c = this._dim(ref.baseColor, this._layerDim(pos.layer));
      ref.mat.color.setHex(c);
      ref.mat.emissive.setHex(c);
      if (pos.layer === 0) this._draggable.push(mesh);
      const scale = this._itemScale(ref.kind, pos.layer);
      const tl = gsap.timeline();
      tl.to(mesh.scale, { x: scale, y: scale, z: scale, duration: a.scatterSeconds, ease: "power2.inOut" }, 0);
      tl.to(
        mesh.position,
        {
          x: pos.loc.slotX[pos.slot],
          y: this._seatY(pos.loc, ref.kind, pos.layer),
          z: this._itemZ(ref.kind, pos.layer),
          duration: a.scatterSeconds,
          ease: "power2.inOut",
        },
        0,
      );
      tl.to(mesh.rotation, { x: 0, y: 0, z: 0, duration: a.scatterSeconds, ease: "power2.inOut" }, 0);
      tl.eventCallback("onComplete", () => {
        done++;
        if (done >= total) {
          this._shuffling = false;
          if (!this._timeUp && !this._ended) this._interactive = true;
          // Flush any broom source-advances that landed during the shuffle.
          for (const loc of this._pendingBroomAdvance) this._advanceIfFrontEmpty(loc);
          this._pendingBroomAdvance.clear();
          this._endOp();
        }
      });
    }
  }

  /** Project the shuffle gather point to screen NDC so the HUD can place the hat
   * exactly over where the items gather (the board camera frames it, not the raw
   * screen centre). */
  /** Unproject a screen NDC point onto the world plane z = `targetZ` (so a HUD
   * button position maps to a world target the 3D items can fly to). */
  private _screenNdcToWorld(ndc: { x: number; y: number }, targetZ: number): THREE.Vector3 {
    const cam = this._ortho!;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const p = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const t = Math.abs(dir.z) < 1e-6 ? 0 : (targetZ - p.z) / dir.z;
    return p.addScaledVector(dir, t);
  }

  public gatherScreenNdc(): { x: number; y: number } {
    const g = this._config?.booster.shuffleAnim.gather ?? { x: 0, y: 0, z: 0 };
    if (!this._ortho) return { x: 0, y: 0 };
    // Refresh the camera matrices so the projection reflects the current framing
    // (otherwise a stale matrixWorldInverse offsets the result).
    this._ortho.updateMatrixWorld();
    this._ortho.updateProjectionMatrix();
    const v = new THREE.Vector3(g.x, g.y, g.z).project(this._ortho);
    return { x: v.x, y: v.y };
  }

  /** Mark the start/end of an async model-mutating op (match / broom). On the end
   * of the last one, re-evaluate the terminal state (so a deferred time-up loss or
   * a just-completed win resolves only once everything has settled). */
  private _beginOp(): void {
    this._busy++;
  }

  private _endOp(): void {
    this._busy = Math.max(0, this._busy - 1);
    this._resolveEndState();
  }

  /**
   * Decide the terminal result ONCE: a solved board is a WIN at any time; a
   * time-up is a LOSS but only once nothing is still animating (`_busy === 0`) —
   * so a broom/match finishing after the clock expires can still turn it into a
   * win instead of a premature game-over.
   */
  private _resolveEndState(): void {
    if (this._ended) return;
    if (this._model?.isSolved()) {
      this._ended = true;
      this._won = true;
      for (const cb of this._winListeners) cb();
      return;
    }
    if (this._timeUp && this._busy === 0) {
      this._ended = true;
      for (const cb of this._loseListeners) cb();
    }
  }

  /** The countdown hit zero: stop new input, but let any running match/broom
   * finish — the win/lose result is resolved once the board settles. */
  public notifyTimeUp(): void {
    if (this._ended || this._timeUp) return;
    this._timeUp = true;
    this.setInteractive(false);
    this._resolveEndState();
  }

  /** Register a win listener (board fully cleared). */
  public onWin(cb: () => void): () => void {
    this._winListeners.add(cb);
    return () => this._winListeners.delete(cb);
  }

  /** Register a lose listener (time ran out with the board unsolved). */
  public onLose(cb: () => void): () => void {
    this._loseListeners.add(cb);
    return () => this._loseListeners.delete(cb);
  }

  /**
   * BROOM booster: pick 3 identical FRONT-layer (on-screen) items and vacuum them
   * into the broom's world target in TWO phases: (1) each lifts slightly in place
   * while smoothly turning its BOTTOM (-Y) toward the button (its travel
   * direction), then (2) flies to the target leaving a comet trail + is removed on
   * arrival. Slots are vacated up front (so nothing re-grabs them); emptied source
   * cells advance + a win is checked once the last item lands. Returns true if a
   * sweep actually ran (false = fewer than 3 identical items on screen / busy). */
  public activateBroom(targetNdc?: { x: number; y: number }): boolean {
    if (!this._interactive || this._dragged || this._shuffling || !this._config || !this._model) return false;
    // Group the front (visible) items by kind+variant; need 3 of one group.
    const groups = new Map<string, THREE.Mesh[]>();
    for (const [mesh, ref] of this._itemRef) {
      if (ref.layer !== 0) continue; // only the front row is on-screen
      if (this._matchingLocs.has(ref.loc)) continue; // cell mid-match — leave it alone
      const key = `${ref.kind}:${ref.variant}`;
      let arr = groups.get(key);
      if (!arr) groups.set(key, (arr = []));
      arr.push(mesh);
    }
    let chosen: THREE.Mesh[] | null = null;
    for (const meshes of groups.values()) {
      if (meshes.length >= 3) {
        chosen = meshes.slice(0, 3);
        break;
      }
    }
    if (!chosen) return false; // no 3 identical items on screen

    const s = this._config.booster.suck;
    const tcfg = this._config.booster.trail;
    // Fly the items to UNDER THE BROOM BUTTON: unproject its screen NDC onto the
    // suck depth plane (z = suck.target.z). Falls back to the fixed config point.
    const target =
      targetNdc && this._ortho
        ? this._screenNdcToWorld(targetNdc, s.target.z)
        : new THREE.Vector3(s.target.x, s.target.y, s.target.z);
    const down = new THREE.Vector3(0, -1, 0);
    const camDir = this._ortho ? this._ortho.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3(0, 0, -1);
    const sourceLocs = new Set<CellSlots>();
    const items = chosen;

    items.forEach((mesh, i) => {
      const ref = this._itemRef.get(mesh);
      if (!ref) return;
      // Vacate the slot NOW (model + grid), un-pick + un-draggable.
      ref.loc.cell.layers[ref.layer][ref.slot] = null;
      ref.loc.meshes[ref.layer][ref.slot] = null;
      sourceLocs.add(ref.loc);
      this._itemRef.delete(mesh);
      this._removeDraggable(mesh);

      const last = i === items.length - 1;
      const delay = i * s.stagger;
      // Target orientation: item's BOTTOM (-Y) points from its (lifted) spot to the
      // button, so it flies bottom-first. Slerp there smoothly during phase 1.
      const liftedY = mesh.position.y + s.liftY;
      const dir = target.clone().sub(new THREE.Vector3(mesh.position.x, liftedY, mesh.position.z)).normalize();
      const startQuat = mesh.quaternion.clone();
      const endQuat = new THREE.Quaternion().setFromUnitVectors(down, dir);
      const trail =
        tcfg.enabled && this._ortho
          ? new TrailRibbon(this, tcfg.color ?? ref.baseColor, tcfg.width, tcfg.tipWidth, tcfg.opacity, tcfg.points, camDir)
          : null;
      if (trail) this._trails.add(trail);

      const tl = gsap.timeline({ delay });
      // Phase 1: lift up + smoothly rotate bottom toward the button (in place).
      const rot = { t: 0 };
      tl.to(mesh.position, { y: liftedY, duration: s.liftSeconds, ease: "power2.out" }, 0);
      tl.to(
        rot,
        {
          t: 1,
          duration: s.liftSeconds,
          ease: "power2.inOut",
          onUpdate: () => mesh.quaternion.slerpQuaternions(startQuat, endQuat, rot.t),
        },
        0,
      );
      // Phase 2: fly to the button (full size), streaking the trail.
      tl.to(
        mesh.position,
        {
          x: target.x,
          y: target.y,
          z: target.z,
          duration: s.seconds,
          ease: "power2.in",
          onUpdate: () => trail?.push(mesh.position),
        },
      );
      tl.eventCallback("onComplete", () => {
        this._trailTweens.delete(tl);
        this.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        if (trail)
          trail.dissolve(tcfg.fade, () => {
            this._trails.delete(trail);
            trail.dispose();
          });
        if (last) {
          // If a shuffle is mid-flight, DEFER the source-cell advance (shifting
          // layers now would corrupt the shuffle's captured slots) — it's flushed
          // when the shuffle finishes. Otherwise advance immediately.
          if (this._shuffling) {
            for (const loc of sourceLocs) this._pendingBroomAdvance.add(loc);
          } else {
            for (const loc of sourceLocs) this._advanceIfFrontEmpty(loc);
          }
          this._endOp(); // sweep fully settled → re-evaluate win/lose
        }
      });
      this._trailTweens.add(tl);
    });
    this._beginOp(); // async model mutation until the last item lands (above)
    return true;
  }

  /** Drop a mesh from the draggable (raycast) list. */
  private _removeDraggable(mesh: THREE.Mesh): void {
    const i = this._draggable.indexOf(mesh);
    if (i >= 0) this._draggable.splice(i, 1);
  }

  /** Per-frame lerp of the dragged item toward its target (frame-rate independent). */
  /** Freeze/unfreeze player interaction. On freeze, any drag in progress is
   * returned to its home slot so nothing is left hanging mid-air. */
  public setInteractive(enabled: boolean): void {
    this._interactive = enabled;
    if (enabled) return;
    const m = this._dragged;
    if (!m) return;
    if (this._releasing) {
      this._settleRelease();
      return;
    }
    // Active (non-releasing) drag: drop the window listeners, restore the vacated
    // origin slot (model + grid) and snap the item back home, upright.
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    const ref = this._itemRef.get(m);
    if (ref) {
      ref.loc.cell.layers[ref.layer][ref.slot] = { kind: ref.kind, variant: ref.variant };
      ref.loc.meshes[ref.layer][ref.slot] = m;
    }
    m.position.copy(this._dragHome);
    m.rotation.set(0, 0, 0);
    this._dragged = null;
    this._dragPointerId = null;
    this._releasing = false;
    this._pendingMatchLoc = null;
  }

  public update(dt: number): void {
    if (this._spin) this._stepSpin(dt); // shuffle physics swirl
    const m = this._dragged;
    if (!m || !this._config) return;
    const k = 1 - Math.exp(-this._config.drag.lerpSpeed * Math.max(0, dt));
    m.position.x += (this._dragTarget.x - m.position.x) * k;
    m.position.y += (this._dragTarget.y - m.position.y) * k;
    m.position.z += (this._dragTarget.z - m.position.z) * k;
    // Natural sway: tilt by how far the item still lags behind the target (∝ drag
    // speed) — leans into horizontal motion, pitches on vertical — easing back to
    // upright as it catches up / releases. Same k, so it's smooth + settles.
    const s = this._config.drag.sway;
    if (s.tilt > 0) {
      const clamp = (v: number): number => Math.max(-s.maxAngle, Math.min(s.maxAngle, v));
      const tz = clamp(-(this._dragTarget.x - m.position.x) * s.tilt);
      const tx = clamp((this._dragTarget.y - m.position.y) * s.tilt);
      m.rotation.z += (tz - m.rotation.z) * k;
      m.rotation.x += (tx - m.rotation.x) * k;
    }
    // On release the target is the final rest (placed slot OR home) — snap + end.
    if (this._releasing && m.position.distanceTo(this._dragTarget) <= this._config.drag.snapEpsilon) {
      this._settleRelease();
    }
  }

  /** Snap the releasing item onto its final rest (placed slot or home), end the
   * drag, and run any deferred 3-of-a-kind collapse. Called from update() when the
   * ease completes, and from _onPointerDown to finalize instantly if a new drag
   * starts first (so the item is never left hanging mid-ease). */
  private _settleRelease(): void {
    const m = this._dragged;
    if (!m) return;
    m.position.copy(this._dragTarget);
    m.rotation.set(0, 0, 0); // clear the drag sway — seated items sit upright
    this._dragged = null;
    this._releasing = false;
    const loc = this._pendingMatchLoc;
    this._pendingMatchLoc = null;
    if (loc) this._tryMatchAndAdvance(loc);
  }

  /** Raycast the pointer against the front-layer items; nearest hit or null.
   * Recursive so an item's pick-fill child (the torus centre disc) counts; the hit
   * is resolved UP to the draggable item mesh it belongs to. */
  private _pickDraggable(event: PointerEvent): THREE.Mesh | null {
    const ndc = this._ndcFromEvent(event);
    if (!ndc || !this._ortho || this._draggable.length === 0) return null;
    this._ray.setFromCamera(ndc, this._ortho);
    const hits = this._ray.intersectObjects(this._draggable, true);
    for (const hit of hits) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
        if (this._draggable.includes(o as THREE.Mesh)) return o as THREE.Mesh;
      }
    }
    return null;
  }

  /** Unproject the pointer onto the drag plane (z = _dragPlaneZ) → _dragTarget. */
  private _updateDragTarget(event: PointerEvent): void {
    const ndc = this._ndcFromEvent(event);
    if (!ndc || !this._ortho) return;
    this._ray.setFromCamera(ndc, this._ortho);
    this._dragPlane.set(this._planeNormal, -this._dragPlaneZ); // plane at z = _dragPlaneZ
    if (this._ray.ray.intersectPlane(this._dragPlane, this._hitPoint)) {
      this._dragTarget.set(this._hitPoint.x, this._hitPoint.y, this._dragPlaneZ);
    }
  }

  /** Where the pointer ray meets the FRONT-layer (board) plane z = itemZ — the
   * plane the cells' slots live on — so a drop maps to the cell the cursor is
   * visually over. Null if there's no camera / canvas size. */
  private _pointerBoardPoint(event: PointerEvent): { x: number; y: number } | null {
    const ndc = this._ndcFromEvent(event);
    if (!ndc || !this._ortho) return null;
    this._ray.setFromCamera(ndc, this._ortho);
    this._dragPlane.set(this._planeNormal, -this._config!.board.itemZ);
    if (!this._ray.ray.intersectPlane(this._dragPlane, this._hitPoint)) return null;
    return { x: this._hitPoint.x, y: this._hitPoint.y };
  }

  /** Pointer position → normalized device coords, or null if the canvas has no size. */
  private _ndcFromEvent(event: PointerEvent): THREE.Vector2 | null {
    const canvas = this._world?.renderer.domElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }

  public override preDestroy(): void {
    super.preDestroy();
    this._winListeners.clear();
    for (const tween of this._trailTweens) tween.kill();
    this._trailTweens.clear();
    for (const trail of this._trails) trail.dispose();
    this._trails.clear();
    this._pointerTarget?.removeEventListener("pointerdown", this._onPointerDown);
    this._pointerTarget?.removeEventListener("contextmenu", this._onContextMenu);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    this._pointerTarget = null;
    // Stop any in-flight match/advance tweens before the meshes are torn down.
    for (const mesh of this._itemRef.keys()) {
      gsap.killTweensOf(mesh.position);
      gsap.killTweensOf(mesh.scale);
    }
    for (const label of this._labels) {
      const m = label.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.dispose();
    }
    this._labels.length = 0;
    this._draggable.length = 0;
    this._allShapes.length = 0;
    this._allSpecs.length = 0;
    this._itemRef.clear();
    this._cellSlots.length = 0;
    this._dragged = null;
    for (const g of this._geoByKind.values()) g.dispose();
    this._geoByKind.clear();
    this._fillGeo?.dispose();
    this._fillGeo = null;
    this._bgTexture?.dispose();
    this._bgTexture = null;
    for (const g of this._frameGeo) g.dispose();
    this._frameGeo.length = 0;
    for (const m of this._materials) m.dispose();
    this._materials.length = 0;
    this._model = null;
    this._config = null;
    this._world = null;
  }
}
