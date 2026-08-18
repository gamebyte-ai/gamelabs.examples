import * as THREE from "three";
import gsap from "gsap";
import { WorldViewBase, World, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IGridView } from "./IGridView";
import { BrickBreakerConfig } from "../BrickBreakerConfig";
import { GameEvents } from "../events/GameEvents";
import { GridModel } from "../models/GridModel";

/** Neon square block textures (one per colour), cycled by row. Paths are relative
 * to this module (src/views/), so `../../assets` reaches the project-root assets. */
const SQUARE_URLS = [
  new URL("../../assets/SP_Square_01.png", import.meta.url).href,
  new URL("../../assets/SP_Square_02.png", import.meta.url).href,
  new URL("../../assets/SP_Square_03.png", import.meta.url).href,
  new URL("../../assets/SP_Square_04.png", import.meta.url).href,
  new URL("../../assets/SP_Square_05.png", import.meta.url).href,
  new URL("../../assets/SP_Square_06.png", import.meta.url).href,
];
/** Cyan ring shooter texture. */
const CANNON_URL = new URL("../../assets/SP_Cannon_01.png", import.meta.url).href;
/** Dotted trajectory strip (horizontal row of dots, 266×18) for the aim guide. */
const TRAJECTORY_URL = new URL("../../assets/UI_Dots_Trajectory_White_01.png", import.meta.url).href;
/** Native aspect (width / height) of the trajectory strip — keeps the dots round. */
const TRAJECTORY_ASPECT = 266 / 18;
/** White ball texture. */
const BALL_URL = new URL("../../assets/SP_Basic_Ball_01.png", import.meta.url).href;
/** Play-area board backdrop. */
const BOARD_URL = new URL("../../assets/SP_Game_Board_01.png", import.meta.url).href;

/** One placed block: its mesh + HP label child + current logical row (0 = bottom)
 * + remaining hits. */
interface Block {
  mesh: THREE.Mesh;
  label: THREE.Mesh;
  row: number;
  col: number;
  hp: number;
}

/** A ball in flight: its mesh + world position + velocity (world units / sec).
 * Once it touches the floor it enters `returning` and slides along the floor to
 * the shooter before being collected. */
interface Ball {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Sliding back to the shooter along the floor. */
  returning: boolean;
  /** Arrived + parked at the shooter as ammo (accumulates; fired on the next shot). */
  resting: boolean;
}

/**
 * The brick grid rendered as flat square blocks in the XY plane (z = 0), framed
 * by an orthographic camera that fits all columns across the width and is
 * bottom-anchored. A tap descends the whole grid one row.
 *
 * Scaffold step: the grid starts FULL; descend just translates every block down
 * one pitch (rows above the view scroll in from the top). Level generation +
 * clearing land later.
 */
export class GridView extends WorldViewBase implements IGridView {
  private _config: BrickBreakerConfig | null = null;
  private _world: World | null = null;
  private _events: GameEvents | null = null;
  private _unsubGameOver: Unsubscribe | null = null;
  private _gameOver = false;
  private _model: GridModel | null = null;
  private _ortho: THREE.OrthographicCamera | null = null;
  private readonly _geo = new THREE.PlaneGeometry(1, 1);
  private readonly _materials: THREE.MeshBasicMaterial[] = [];
  private readonly _textures: THREE.Texture[] = [];
  private readonly _texLoader = new THREE.TextureLoader();
  private readonly _blocks: Block[] = [];
  /** Bricks mid break-animation (no longer collidable; disposed on complete). */
  private readonly _breaking: Block[] = [];
  /** Neon square textures (per colour), loaded once, reused for every spawned row. */
  private _squareTex: THREE.Texture[] = [];
  /** HP-number label textures, cached by hp value (shared across bricks). */
  private readonly _hpTexCache = new Map<number, THREE.CanvasTexture>();
  /** HP of the NEXT row to spawn; grows by 1 each shot. */
  private _rowHp = 1;
  /** Count of spawned rows — cycles the block textures in a fixed order. */
  private _spawnCount = 0;
  /** Clips everything above the bottom `visibleRows` so upper rows never show. */
  private _clipPlane: THREE.Plane | null = null;
  private _bgTexture: THREE.CanvasTexture | null = null;
  private _animating = false;
  private _canvas: HTMLCanvasElement | null = null;
  // Shooter + aim state.
  private _shooterMesh: THREE.Mesh | null = null;
  private _shooterGeo: THREE.CircleGeometry | null = null;
  private _aimLineMesh: THREE.Mesh | null = null;
  /** Current shooter X (world). Moves to the first-landed ball after each shot. */
  private _shooterX = 0;
  /** X the current shot's balls launch from (locked at shot start). */
  private _shotOriginX = 0;
  /** Set once per shot when the first ball reaches the floor. */
  private _firstLandingDone = false;
  /** X the landed balls slide toward (= where the shooter is heading). */
  private _returnTargetX = 0;
  /** gsap tween proxy for the smooth shooter slide. */
  private readonly _shooterProxy = { x: 0 };
  /** Current aim angle (radians, from +X; π/2 = straight up). */
  private _aimAngle = Math.PI / 2;
  /** Pointer-drag tracking: aiming while pressed, and whether it moved (drag vs tap). */
  private _aiming = false;
  private _pointerMoved = false;
  private _downInArea = false;
  private _pointerStart = new THREE.Vector2();

  // Ball / shooting state.
  private _ballGeo: THREE.PlaneGeometry | null = null;
  private _ballTex: THREE.Texture | null = null;
  private readonly _balls: Ball[] = [];
  /** Balls per shot; grows by 1 after every shot. */
  private _bulletCount = 1;
  /** true while a shot is in progress (spawning or balls still in flight). */
  private _shooting = false;
  /** Locked aim direction for the in-progress shot. */
  private _shotDir = new THREE.Vector2(0, 1);
  private _toSpawn = 0;
  private _spawnTimer = 0;
  private _countLabel: THREE.Mesh | null = null;
  private _countTex: THREE.CanvasTexture | null = null;

  /** Half-width of the play area (left/right walls at ±this). */
  private get _halfW(): number {
    return (this._config!.grid.cols / 2) * this._pitch;
  }
  /** Y of the top wall (the clip cutoff — balls bounce here). */
  private get _topWall(): number {
    const g = this._config!.grid;
    return (g.visibleRows - 0.5) * this._pitch + g.yOffset;
  }
  /** Y of the floor where balls are collected (the shooter line). */
  private get _floorY(): number {
    return this._shooterY;
  }
  /** Y a ball rests at once it reaches the floor (with the wall floor offset). */
  private get _collectY(): number {
    return this._floorY + this._config!.walls.floorOffset;
  }

  /** World-space pitch between block centres. */
  private get _pitch(): number {
    const g = this._config!.grid;
    return g.cellSize + g.gap;
  }

  /** World Y of the play-area bottom edge (outline inner-bottom / below row 0). */
  private get _playAreaBottom(): number {
    const g = this._config!.grid;
    return -0.5 * this._pitch + g.yOffset;
  }

  /** World Y of the shooter centre — just inside the base of the play area. */
  private get _shooterY(): number {
    return this._playAreaBottom + this._config!.shooter.yFromBase;
  }

  /** Row where new rows enter: ONE below the topmost visible row (which is kept
   * empty so bricks can also be hit from above). */
  private get _spawnRowIndex(): number {
    return this._config!.grid.visibleRows - 2;
  }

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(BrickBreakerConfig);
    this._world = resolver.getInstance(World);
    this._events = resolver.getInstance(GameEvents);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const g = this._config!.grid;
    this._model = new GridModel(g.cols, g.rows, g.fillFromRow);
    // Clip everything ABOVE the bottom `visibleRows` rows (world plane, normal
    // down): kept where y <= cutoff. The cutoff sits in the gap just above the
    // top visible row, so upper rows are hidden no matter the screen aspect.
    if (this._world) this._world.renderer.localClippingEnabled = true;
    const cutoff = (g.visibleRows - 0.5) * this._pitch + g.yOffset;
    this._clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutoff);
    this._setupCamera();
    this._buildBoard();
    this._buildGrid();
    this._buildOutline();
    this._buildShooter();
    this._bulletCount = Math.max(1, Math.floor(this._config!.ball.startCount));
    this._rowHp = Math.max(1, Math.floor(this._config!.brick.hp));
    this._spawnRow(false); // initial row
    this._buildBallResources();
    this._spawnRestingBall(); // the starting ammo, parked on the shooter
    this._buildCountLabel();
    // Size the frustum NOW from the renderer (don't wait for the base's microtask
    // onResize — until it fires the ortho is a tiny ±1 box and the grid is off-view).
    const size = this._world?.renderer.getSize(new THREE.Vector2());
    if (size && size.x > 0 && size.y > 0) this.onResize(size.x, size.y, 1);

    // Aim on pointer MOVE (mouse hover / touch drag) while over the play area. We
    // listen on `window` so the HUD's overlaying canvas can't swallow hover moves;
    // `_aimAt` maps to world coords + checks the play area itself.
    this._canvas = this._world?.renderer.domElement ?? null;
    window.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    // Per-frame ball physics are driven by the controller's UpdateManager tick
    // (calls `update(dt)`) — the view's DI container can't resolve UpdateManager.

    // Timer ran out → freeze the board (no more shooting / physics).
    this._unsubGameOver = this._events?.onGameOver(() => (this._gameOver = true)) ?? null;
  }

  /** Ortho camera: fit all columns across the width (+ side margin), bottom-anchored
   * so row 0 sits just above the bottom edge. Height follows the aspect (onResize). */
  private _setupCamera(): void {
    const world = this._world;
    if (!world) return;
    // The World seeds the scene with a depth FOG that fades distant objects to the
    // background (black) — kill it so the flat blocks read at full colour.
    world.scene.fog = null;
    // Vertical gradient backdrop (top → bottom).
    this._bgTexture = this._makeGradientTexture();
    world.scene.background = this._bgTexture;
    this._ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this._ortho.position.z = this._config!.camera.z;
    world.setActiveCamera(this._ortho);
  }

  /** A 4×256 vertical gradient (top → bottom) as a CanvasTexture for the backdrop. */
  private _makeGradientTexture(): THREE.CanvasTexture {
    const bg = this._config!.background;
    const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, hex(bg.top));
    grad.addColorStop(1, hex(bg.bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public override onResize(width: number, height: number, _dpr: number): void {
    super.onResize(width, height, _dpr);
    const ortho = this._ortho;
    if (!ortho || width === 0 || height === 0) return;
    const g = this._config!.grid;
    const c = this._config!.camera;
    const pitch = this._pitch;
    const aspect = width / height;
    // FIXED vertical framing: the frustum height is frozen at `refAspect` and does
    // not depend on the live aspect, so widening the screen never shifts/zooms the
    // grid — it only adds width. The frozen height fits both the columns across the
    // width (at refAspect) AND the bottom `visibleRows` rows.
    const needW = g.cols * pitch + 2 * c.sideMargin;
    const rowsH = (g.visibleRows - 1) * pitch + g.cellSize + c.bottomMargin + c.topMargin;
    const frozenH = Math.max(needW / c.refAspect, rowsH);
    // For screens at least as wide as refAspect the height is CONSTANT; narrower
    // screens (rare — viewport clamps) zoom out to keep all columns visible.
    const frustumH = aspect >= c.refAspect ? frozenH : needW / aspect;
    const frustumW = frustumH * aspect; // square scale ⇒ no stretch; ≥ needW here
    ortho.left = -frustumW / 2;
    ortho.right = frustumW / 2;
    ortho.top = frustumH / 2;
    ortho.bottom = -frustumH / 2;
    // Bottom-anchor: frustum bottom sits `bottomMargin` below row 0's bottom edge.
    const centerY = frustumH / 2 - g.cellSize / 2 - c.bottomMargin;
    ortho.position.set(0, centerY, c.z);
    ortho.lookAt(0, centerY, 0);
    ortho.updateProjectionMatrix();
  }

  /** X/Y world position of a block at (row, col). */
  private _cellX(col: number): number {
    const g = this._config!.grid;
    return (col - (g.cols - 1) / 2) * this._pitch;
  }
  private _cellY(row: number): number {
    return row * this._pitch + this._config!.grid.yOffset;
  }

  /** The play-area board backdrop (behind the bricks), sized to the visible area. */
  private _buildBoard(): void {
    const b = this._config!.board;
    if (!b.enabled) return;
    const g = this._config!.grid;
    const pitch = this._pitch;
    const clip = this._clipPlane ? [this._clipPlane] : undefined;
    const width = g.cols * pitch * b.scale;
    const height = g.visibleRows * pitch * b.scale;
    // Centre of the visible band (row 0 … visibleRows−1).
    const centerY = ((g.visibleRows - 1) / 2) * pitch + g.yOffset;
    const mat = new THREE.MeshBasicMaterial({ map: this._loadTexture(BOARD_URL), transparent: true, clippingPlanes: clip });
    this._materials.push(mat);
    const mesh = new THREE.Mesh(this._geo, mat);
    mesh.scale.set(width, height, 1);
    mesh.position.set(0, centerY, -0.1); // behind the bricks, in front of the gradient
    this.add(mesh);
  }

  private _buildGrid(): void {
    const g = this._config!.grid;
    const clip = this._clipPlane ? [this._clipPlane] : undefined;
    // Load the neon square textures once — reused for every spawned brick.
    this._squareTex = SQUARE_URLS.map((u) => this._loadTexture(u));

    // Optional white LATTICE frame per cell (purely decorative backing).
    if (g.showCellBorder) {
      for (let row = 0; row < g.rows; row++) {
        for (let col = 0; col < g.cols; col++) {
          const frameMat = new THREE.MeshBasicMaterial({ color: g.borderColor, clippingPlanes: clip });
          const frame = new THREE.Mesh(this._geo, frameMat);
          frame.scale.set(g.cellSize, g.cellSize, 1);
          frame.position.set(this._cellX(col), this._cellY(row), -0.02);
          this.add(frame);
          this._materials.push(frameMat);
        }
      }
    }
  }

  /** Create one brick (neon square sprite + centred HP number) at (row, col). The
   * HP label is a child so it moves/animates with the brick. */
  private _makeBlock(row: number, col: number, hp: number, texIndex: number, yStart?: number): Block {
    const g = this._config!.grid;
    const clip = this._clipPlane ? [this._clipPlane] : undefined;
    const blockSize = g.cellSize * g.blockScale;
    const n = this._squareTex.length;
    const tex = this._squareTex[((texIndex % n) + n) % n];

    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, clippingPlanes: clip });
    const mesh = new THREE.Mesh(this._geo, mat);
    mesh.scale.set(blockSize, blockSize, 1);
    mesh.position.set(this._cellX(col), yStart ?? this._cellY(row), 0);

    // HP number, centred, sized ~55% of the cell (child ⇒ inherits the block's
    // transform, so it rides the descend/spawn animations for free).
    const labelMat = new THREE.MeshBasicMaterial({ map: this._hpTexture(hp), transparent: true, clippingPlanes: clip });
    const label = new THREE.Mesh(this._geo, labelMat);
    const s = 0.55 / g.blockScale;
    label.scale.set(s, s, 1);
    label.position.set(0, 0, 0.02);
    mesh.add(label);

    this.add(mesh);
    return { mesh, label, row, col, hp };
  }

  /** A white HP-number texture, cached by value (shared across bricks). */
  private _hpTexture(hp: number): THREE.CanvasTexture {
    const cached = this._hpTexCache.get(hp);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 84px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(hp), 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._hpTexCache.set(hp, tex);
    return tex;
  }

  /** Spawn a full row of bricks at `_spawnRowIndex` with the current `_rowHp`, then
   * grow `_rowHp` by one (so each shot's row is +1 tougher). When `animate`, the
   * row slides in from one row above (the empty top row). */
  private _spawnRow(animate: boolean): void {
    const g = this._config!.grid;
    const row = this._spawnRowIndex;
    const dur = this._config!.descend.seconds;
    // One texture per row, advancing through the set in a fixed, repeating order.
    const texIndex = this._spawnCount % this._squareTex.length;
    for (let col = 0; col < g.cols; col++) {
      if (!this._colFilled(col)) continue; // level mask leaves this column empty
      const yStart = animate ? this._cellY(row + 1) : undefined;
      const blk = this._makeBlock(row, col, this._rowHp, texIndex, yStart);
      if (animate) gsap.to(blk.mesh.position, { y: this._cellY(row), duration: dur, ease: "power2.inOut" });
      this._blocks.push(blk);
    }
    this._rowHp += 1;
    this._spawnCount += 1;
  }

  /** Whether the current level fills `col` in a spawned row (its column mask). */
  private _colFilled(col: number): boolean {
    const lv = this._config!.level;
    const mask = lv.columnMasks[lv.current - 1];
    if (!mask || mask.length !== this._config!.grid.cols) return true; // no/!fit mask ⇒ solid
    return mask[col];
  }

  /** Load a texture (sRGB), tracked for disposal. */
  private _loadTexture(url: string): THREE.Texture {
    const tex = this._texLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textures.push(tex);
    return tex;
  }

  /** Static frame around the visible play area (bottom `visibleRows` × `cols`).
   * NOT clipped — the top bar sits on the clip line, marking where blocks vanish. */
  private _buildOutline(): void {
    const o = this._config!.outline;
    if (!o.enabled) return;
    const g = this._config!.grid;
    const pitch = this._pitch;
    // Play-area bounds (a half-gap margin around the outer cells).
    const half = 0.5 * pitch;
    const left = -(g.cols / 2) * pitch;
    const right = (g.cols / 2) * pitch;
    const bottom = -half + g.yOffset;
    const top = (g.visibleRows - 0.5) * pitch + g.yOffset;
    // Inner edge of the frame (bounds + padding); outer edge adds the thickness.
    const L = left - o.padding;
    const R = right + o.padding;
    const B = bottom - o.padding;
    const T = top + o.padding;
    const w = o.thickness;

    // Four bars: top/bottom span the full outer width (covering the corners),
    // left/right fill the gap between them.
    const bar = (cx: number, cy: number, sx: number, sy: number): void => {
      const mat = new THREE.MeshBasicMaterial({ color: o.color });
      this._materials.push(mat);
      const mesh = new THREE.Mesh(this._geo, mat);
      mesh.scale.set(sx, sy, 1);
      mesh.position.set(cx, cy, 0.03);
      this.add(mesh);
    };
    const outerW = R - L + 2 * w;
    bar((L + R) / 2, T + w / 2, outerW, w); // top
    bar((L + R) / 2, B - w / 2, outerW, w); // bottom
    bar(L - w / 2, (B + T) / 2, w, T - B); // left
    bar(R + w / 2, (B + T) / 2, w, T - B); // right
  }

  /** Circle shooter at the base of the play area + its aim guide line. */
  private _buildShooter(): void {
    const s = this._config!.shooter;
    if (!s.enabled) return;
    this._aimAngle = this._clampAngle((s.startAngleDeg * Math.PI) / 180);

    // Aim guide: a DOTTED trajectory strip (UI_Dots_Trajectory), tiled along the
    // line so dots stay round + evenly spaced. A unit plane scaled to length/width,
    // repositioned + rotated with the aim.
    if (s.aimLine.enabled) {
      const tex = this._loadTexture(TRAJECTORY_URL);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      // One texture tile spans `width * ASPECT` world units, so tiles are undistorted
      // (round dots); repeat that pattern across the full line length.
      tex.repeat.set(s.aimLine.length / (s.aimLine.width * TRAJECTORY_ASPECT), 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: s.aimLine.color, transparent: true });
      this._materials.push(mat);
      this._aimLineMesh = new THREE.Mesh(this._geo, mat);
      this.add(this._aimLineMesh);
    }

    // The shooter: the cyan ring sprite (SP_Cannon_01). Sized by `radius`, aspect
    // preserved from the source texture (75×83).
    const cannonMat = new THREE.MeshBasicMaterial({ map: this._loadTexture(CANNON_URL), transparent: true });
    this._materials.push(cannonMat);
    this._shooterMesh = new THREE.Mesh(this._geo, cannonMat);
    this._shooterMesh.scale.set(2 * s.radius, 2 * s.radius * (83 / 75), 1);
    this._shooterMesh.position.set(this._shooterX, this._shooterY, 0.04);
    this.add(this._shooterMesh);

    this._updateAimLine();
  }

  /** Clamp an angle (radians) into the shooter's aim cone: [min, π − min], where
   * `min` is the minimum firing angle above horizontal. */
  private _clampAngle(a: number): number {
    const min = (this._config!.shooter.minAngleDeg * Math.PI) / 180;
    return Math.max(min, Math.min(Math.PI - min, a));
  }

  /** Is a world point inside the visible play area (the outlined band)? */
  private _isInPlayArea(world: THREE.Vector2): boolean {
    const g = this._config!.grid;
    const pitch = this._pitch;
    const halfW = (g.cols / 2) * pitch;
    const bottom = this._playAreaBottom;
    const top = (g.visibleRows - 0.5) * pitch + g.yOffset;
    return world.x >= -halfW && world.x <= halfW && world.y >= bottom && world.y <= top;
  }

  /** Point the shooter + aim guide at `_aimAngle`, anchored at the shooter. */
  private _updateAimLine(): void {
    const s = this._config!.shooter;
    // The shooter sprite itself rotates to face the aim (its opening points up at
    // 90°, so offset by −π/2).
    if (this._shooterMesh) this._shooterMesh.rotation.z = this._aimAngle - Math.PI / 2;

    const mesh = this._aimLineMesh;
    if (!mesh) return;
    const len = s.aimLine.length;
    const dx = Math.cos(this._aimAngle);
    const dy = Math.sin(this._aimAngle);
    // Local +X is the guide's length axis, so rotation.z = angle aligns it.
    mesh.scale.set(len, s.aimLine.width, 1);
    mesh.rotation.z = this._aimAngle;
    mesh.position.set(this._shooterX + dx * (len / 2), this._shooterY + dy * (len / 2), 0.035);
  }

  /** Max |X| the shooter centre can reach (keeps it inside the outline). */
  private get _shooterXLimit(): number {
    const o = this._config!.outline;
    const pad = o.enabled ? o.padding : 0;
    return Math.max(0, this._halfW + pad - this._config!.shooter.radius);
  }

  /** Move the shooter (and its aim line + count label) to `x`, clamped inside the
   * play area, smoothly over `shooter.moveSeconds`. */
  private _moveShooterTo(x: number): void {
    const target = Math.max(-this._shooterXLimit, Math.min(this._shooterXLimit, x));
    gsap.killTweensOf(this._shooterProxy);
    this._shooterProxy.x = this._shooterX;
    gsap.to(this._shooterProxy, {
      x: target,
      duration: this._config!.shooter.moveSeconds,
      ease: "power2.out",
      onUpdate: () => this._setShooterX(this._shooterProxy.x),
    });
  }

  private _setShooterX(x: number): void {
    this._shooterX = x;
    if (this._shooterMesh) this._shooterMesh.position.x = x;
    if (this._countLabel) this._countLabel.position.x = x;
    this._updateAimLine();
  }

  /** Convert a pointer event to world (x, y) on the z = 0 plane via the ortho cam. */
  private _pointerToWorld(clientX: number, clientY: number): THREE.Vector2 | null {
    const canvas = this._canvas;
    const ortho = this._ortho;
    if (!canvas || !ortho) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(ndcX, ndcY, 0).unproject(ortho);
    return new THREE.Vector2(v.x, v.y);
  }

  /** Point the shooter at a pointer position IF it's inside the play area (clamped
   * to the aim cone). Returns true if it aimed, false if the pointer was outside. */
  private _aimAt(clientX: number, clientY: number): boolean {
    const world = this._pointerToWorld(clientX, clientY);
    if (!world || !this._isInPlayArea(world)) return false;
    const angle = Math.atan2(world.y - this._shooterY, world.x - this._shooterX);
    this._aimAngle = this._clampAngle(angle);
    this._updateAimLine();
    return true;
  }

  /** Advance the grid one step (called once per shot, after all balls return):
   * slide every existing brick down one row, then bring in a fresh row from the
   * top at `_spawnRowIndex`. */
  public descend(): void {
    if (this._animating) return;
    this._animating = true;
    const dur = this._config!.descend.seconds;
    for (const b of this._blocks) {
      b.row -= 1;
      gsap.to(b.mesh.position, { y: this._cellY(b.row), duration: dur, ease: "power2.inOut" });
    }
    this._spawnRow(true); // new row slides in from the empty top row
    gsap.delayedCall(dur, () => (this._animating = false));
  }

  // ── Ball / shooting ──────────────────────────────────────────────────────

  /** Shared ball geometry + texture (one plane geo, one texture, many meshes). */
  private _buildBallResources(): void {
    this._ballGeo = new THREE.PlaneGeometry(1, 1);
    this._ballTex = this._loadTexture(BALL_URL);
  }

  /** World position a returned ball parks at (the ammo pile on the shooter). */
  private _restPos(): { x: number; y: number } {
    const lb = this._config!.shooter.loadedBall;
    return { x: this._returnTargetX + lb.offsetX, y: this._shooterY + lb.offsetY };
  }

  /** Create a ball parked (resting) at the shooter — the visible loaded ammo. */
  private _spawnRestingBall(): void {
    const b = this._config!.ball;
    const p = this._restPos();
    const mat = new THREE.MeshBasicMaterial({ map: this._ballTex!, transparent: true });
    const mesh = new THREE.Mesh(this._ballGeo!, mat);
    mesh.scale.set(2 * b.radius, 2 * b.radius, 1);
    mesh.position.set(p.x, p.y, 0.06);
    this.add(mesh);
    this._balls.push({ mesh, x: p.x, y: p.y, vx: 0, vy: 0, returning: false, resting: true });
  }

  /** A small "×N" label above the shooter showing the current ball count. */
  private _buildCountLabel(): void {
    this._countTex = new THREE.CanvasTexture(document.createElement("canvas"));
    this._countTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this._countTex, transparent: true });
    this._materials.push(mat);
    this._countLabel = new THREE.Mesh(this._geo, mat);
    // Size (font) + vertical position from config; width tracks the 2:1 texture.
    const cc = this._config!.shooter.count;
    this._countLabel.scale.set(cc.size * 2, cc.size, 1);
    this._countLabel.position.set(this._shooterX, this._shooterY + cc.yOffset, 0.05);
    this.add(this._countLabel);
    this._updateCountLabel();
  }

  private _updateCountLabel(): void {
    if (!this._countTex) return;
    const canvas = this._countTex.image as HTMLCanvasElement;
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 90px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${this._bulletCount}`, canvas.width / 2, canvas.height / 2);
    this._countTex.needsUpdate = true;
  }

  /** Fire the current shot: `_bulletCount` balls streamed in the aim direction. */
  private _shoot(): void {
    if (this._gameOver || this._shooting || this._animating || !this._ballGeo || this._blocks.length === 0) return;
    // The parked ammo launches as the new stream — clear it, then fire fresh balls.
    for (const ball of this._balls) {
      this.remove(ball.mesh);
      (ball.mesh.material as THREE.Material).dispose();
    }
    this._balls.length = 0;
    this._shooting = true;
    this._shotDir.set(Math.cos(this._aimAngle), Math.sin(this._aimAngle));
    this._toSpawn = this._bulletCount;
    this._spawnTimer = 0; // first ball spawns immediately on the next tick
    this._shotOriginX = this._shooterX; // all balls launch from here this shot
    this._firstLandingDone = false;
  }

  private _spawnBall(): void {
    const b = this._config!.ball;
    // Per-ball material (disposed when the ball is collected) — not tracked in
    // `_materials`, which would double-dispose + grow unbounded across rounds.
    const mat = new THREE.MeshBasicMaterial({ map: this._ballTex!, transparent: true });
    const mesh = new THREE.Mesh(this._ballGeo!, mat);
    mesh.scale.set(2 * b.radius, 2 * b.radius, 1);
    mesh.position.set(this._shotOriginX, this._shooterY, 0.06);
    this.add(mesh);
    this._balls.push({
      mesh,
      x: this._shotOriginX,
      y: this._shooterY,
      vx: this._shotDir.x * b.speed,
      vy: this._shotDir.y * b.speed,
      returning: false,
      resting: false,
    });
  }

  /** Per-frame update (driven by the controller's UpdateManager tick): stream out
   * balls, step physics, end the round when empty. */
  public update(dt: number): void {
    if (this._gameOver || !this._shooting) return;
    const b = this._config!.ball;

    // Stream out the shot's balls, one every `shootInterval`.
    if (this._toSpawn > 0) {
      this._spawnTimer -= dt;
      while (this._toSpawn > 0 && this._spawnTimer <= 0) {
        this._spawnBall();
        this._toSpawn--;
        this._spawnTimer += b.shootInterval;
      }
    }

    // Advance every ball. Flying balls bounce until they touch the floor; landed
    // balls slide along the floor toward the shooter, then are collected.
    const returnStep = b.returnSpeed * dt;
    for (let i = this._balls.length - 1; i >= 0; i--) {
      const ball = this._balls[i];
      if (ball.resting) continue; // parked ammo — stays put until the next shot
      if (ball.returning) {
        // Slide toward the ammo pile on the shooter; PARK (accumulate) on arrival.
        const p = this._restPos();
        const dx = p.x - ball.x;
        const dy = p.y - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= returnStep || dist === 0) {
          ball.x = p.x;
          ball.y = p.y;
          ball.vx = 0;
          ball.vy = 0;
          ball.returning = false;
          ball.resting = true;
          ball.mesh.position.set(p.x, p.y, 0.06);
        } else {
          ball.x += (dx / dist) * returnStep;
          ball.y += (dy / dist) * returnStep;
          ball.mesh.position.set(ball.x, ball.y, 0.06);
        }
        continue;
      }
      if (!this._stepBall(ball, dt)) continue; // still flying

      // Touched the floor → head back to the shooter. The FIRST ball fixes where
      // the shooter (and the whole pile) ends up.
      ball.y = this._collectY;
      ball.mesh.position.set(ball.x, ball.y, 0.06);
      if (!this._firstLandingDone) {
        this._firstLandingDone = true;
        this._returnTargetX = Math.max(-this._shooterXLimit, Math.min(this._shooterXLimit, ball.x));
        this._moveShooterTo(ball.x);
      }
      ball.returning = true;
    }

    // Round ends once every ball is spawned AND parked back on the shooter.
    if (this._toSpawn === 0 && this._balls.length > 0 && this._balls.every((ba) => ba.resting)) {
      this._endRound();
    }
  }

  /** Round over: grow the ball count, drop the grid one step, re-arm. */
  private _endRound(): void {
    this._shooting = false;
    this._bulletCount += 1;
    this._updateCountLabel();
    this.descend();
  }

  /** Integrate one ball for `dt`, bouncing off walls + bricks. Returns true if it
   * fell to the floor and should be collected. Uses sub-steps so a fast ball can't
   * tunnel through a wall or brick. */
  private _stepBall(ball: Ball, dt: number): boolean {
    const b = this._config!.ball;
    const r = b.radius;
    const dist = b.speed * dt;
    const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      // Side + top walls. Boundaries are the VISIBLE outline's inner surfaces (so a
      // ball's edge bounces exactly on the frame you see), then nudged by the
      // per-side collider offsets. The ball edge (± r) touches the wall.
      const w = this._config!.walls;
      // Wall padding is independent of whether the outline is DRAWN (the board's
      // own frame is the visual wall now); keep the tuned collider position.
      const pad = this._config!.outline.padding;
      const leftLim = -this._halfW - pad + w.leftInset + r;
      const rightLim = this._halfW + pad - w.rightInset - r;
      if (ball.x < leftLim) {
        ball.x = leftLim;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x > rightLim) {
        ball.x = rightLim;
        ball.vx = -Math.abs(ball.vx);
      }
      const topLim = this._topWall + pad - w.topInset - r;
      if (ball.y > topLim) {
        ball.y = topLim;
        ball.vy = -Math.abs(ball.vy);
      }

      // Bricks: reflect off the first one hit + damage it.
      this._collideBricks(ball);

      // Floor: collected (returned to the shooter).
      if (ball.y <= this._floorY + w.floorOffset) return true;
    }
    ball.mesh.position.set(ball.x, ball.y, 0.06);
    return false;
  }

  /** Circle-vs-AABB against each brick's cell box; reflect the ball off the first
   * hit and decrement that brick's hp (removing it at 0). */
  private _collideBricks(ball: Ball): void {
    const r = this._config!.ball.radius;
    const half = this._config!.grid.cellSize / 2;
    for (let i = 0; i < this._blocks.length; i++) {
      const blk = this._blocks[i];
      const cx = this._cellX(blk.col);
      const cy = this._cellY(blk.row);
      // Closest point on the brick box to the ball centre.
      const nx = Math.max(cx - half, Math.min(ball.x, cx + half));
      const ny = Math.max(cy - half, Math.min(ball.y, cy + half));
      const dx = ball.x - nx;
      const dy = ball.y - ny;
      if (dx * dx + dy * dy > r * r) continue; // no overlap

      // Reflect along the dominant axis of penetration (box faces are axis-aligned).
      if (Math.abs(ball.x - cx) > Math.abs(ball.y - cy)) {
        ball.vx = ball.x < cx ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        ball.x = ball.x < cx ? cx - half - r : cx + half + r;
      } else {
        ball.vy = ball.y < cy ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        ball.y = ball.y < cy ? cy - half - r : cy + half + r;
      }

      blk.hp -= 1;
      if (blk.hp <= 0) {
        this._blocks.splice(i, 1); // out of the collision set immediately
        this._breakBlock(blk);
      } else {
        // Show the reduced HP on the brick.
        const lm = blk.label.material as THREE.MeshBasicMaterial;
        lm.map = this._hpTexture(blk.hp);
        lm.needsUpdate = true;
      }
      return; // one brick per sub-step
    }
  }

  /** Play a brick's destruction: HP number vanishes at once, the sprite scales up
   * while fading out, then it's removed. Already out of the collision set. */
  private _breakBlock(blk: Block): void {
    const br = this._config!.brick.break;
    blk.label.visible = false; // HP number gone instantly
    this._breaking.push(blk);
    const mat = blk.mesh.material as THREE.MeshBasicMaterial;
    const sx = blk.mesh.scale.x;
    const sy = blk.mesh.scale.y;
    gsap.to(blk.mesh.scale, { x: sx * br.scaleUp, y: sy * br.scaleUp, duration: br.seconds, ease: "power2.out" });
    gsap.to(mat, {
      opacity: 0,
      duration: br.seconds,
      ease: "power2.out",
      onComplete: () => {
        this.remove(blk.mesh);
        mat.dispose();
        (blk.label.material as THREE.Material).dispose();
        const idx = this._breaking.indexOf(blk);
        if (idx >= 0) this._breaking.splice(idx, 1);
      },
    });
  }

  private readonly _onPointerDown = (e: PointerEvent): void => {
    this._aiming = true;
    this._pointerMoved = false;
    this._pointerStart.set(e.clientX, e.clientY);
    // Only a press that STARTS inside the play area counts as a shot/tap.
    this._downInArea = this._config!.shooter.enabled ? this._aimAt(e.clientX, e.clientY) : false;
  };

  private readonly _onPointerMove = (e: PointerEvent): void => {
    // The shooter FOLLOWS the pointer whenever it's over the play area — hover
    // (mouse) or drag (touch), no press required. Outside the area it holds.
    if (this._config!.shooter.enabled) this._aimAt(e.clientX, e.clientY);
    if (!this._aiming) return;
    const dx = e.clientX - this._pointerStart.x;
    const dy = e.clientY - this._pointerStart.y;
    if (dx * dx + dy * dy > 36) this._pointerMoved = true; // > 6px ⇒ a drag
  };

  private readonly _onPointerUp = (): void => {
    if (!this._aiming) return;
    this._aiming = false;
    // A plain tap inside the play area (no meaningful drag) FIRES the shot.
    if (this._downInArea && !this._pointerMoved) this._shoot();
  };

  public override preDestroy(): void {
    super.preDestroy();
    window.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    this._unsubGameOver?.();
    this._unsubGameOver = null;
    gsap.killTweensOf(this._shooterProxy);
    for (const b of this._blocks) {
      gsap.killTweensOf(b.mesh.position);
      (b.mesh.material as THREE.Material).dispose();
      (b.label.material as THREE.Material).dispose();
    }
    this._blocks.length = 0;
    for (const b of this._breaking) {
      gsap.killTweensOf(b.mesh.scale);
      gsap.killTweensOf(b.mesh.material);
      (b.mesh.material as THREE.Material).dispose();
      (b.label.material as THREE.Material).dispose();
    }
    this._breaking.length = 0;
    for (const ball of this._balls) (ball.mesh.material as THREE.Material).dispose();
    this._balls.length = 0;
    for (const m of this._materials) m.dispose();
    this._materials.length = 0;
    for (const t of this._textures) t.dispose();
    this._textures.length = 0;
    for (const t of this._hpTexCache.values()) t.dispose();
    this._hpTexCache.clear();
    this._geo.dispose();
    this._ballGeo?.dispose();
    this._ballGeo = null;
    this._countTex?.dispose();
    this._countTex = null;
    this._countLabel = null;
    this._shooterGeo?.dispose();
    this._shooterGeo = null;
    this._shooterMesh = null;
    this._aimLineMesh = null;
    if (this._world) this._world.scene.background = null;
    this._bgTexture?.dispose();
    this._bgTexture = null;
    this._config = null;
    this._world = null;
    this._events = null;
    this._model = null;
  }
}
