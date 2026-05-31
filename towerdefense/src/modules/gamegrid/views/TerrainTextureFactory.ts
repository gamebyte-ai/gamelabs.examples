import * as THREE from "three";
import { CellType } from "../../../constants/CellType.js";

/**
 * Generates and caches procedural `THREE.CanvasTexture` terrain tiles.
 *
 * One 128 × 128 canvas per {@link CellType}, drawn once on first access
 * and shared across every cell of that type. No external image files, no
 * async loading — just 2D canvas drawing so the textures are available
 * synchronously whenever a cell's `createVisual` runs.
 *
 * Each terrain style is built from a base colour, several layers of
 * soft noise patches (random circles at varying opacity), and a
 * sprinkling of detail pixels that break up the flat look. The result is
 * a simple but visually appealing hand-painted aesthetic that replaces
 * the old single-colour flat tiles.
 */
export class TerrainTextureFactory {
  private static readonly SIZE = 128;
  private static readonly _cache = new Map<CellType, THREE.CanvasTexture>();
  private static _pathStraight: THREE.CanvasTexture | null = null;
  private static _pathTurnRight: THREE.CanvasTexture | null = null;
  private static _pathTurnLeft: THREE.CanvasTexture | null = null;

  public static getTexture(cellType: CellType): THREE.CanvasTexture {
    const cached = TerrainTextureFactory._cache.get(cellType);
    if (cached) return cached;
    const texture = TerrainTextureFactory._generate(cellType);
    TerrainTextureFactory._cache.set(cellType, texture);
    return texture;
  }

  /** Straight road running top→bottom (north→south at rotation 0). */
  public static getPathStraight(): THREE.CanvasTexture {
    if (!TerrainTextureFactory._pathStraight) TerrainTextureFactory._pathStraight = TerrainTextureFactory._makePathStraight();
    return TerrainTextureFactory._pathStraight;
  }

  /** Right-hand turn entering from bottom, exiting right (south→east at rotation 0). */
  public static getPathTurnRight(): THREE.CanvasTexture {
    if (!TerrainTextureFactory._pathTurnRight) TerrainTextureFactory._pathTurnRight = TerrainTextureFactory._makePathTurn(true);
    return TerrainTextureFactory._pathTurnRight;
  }

  /** Left-hand turn entering from bottom, exiting left (south→west at rotation 0). */
  public static getPathTurnLeft(): THREE.CanvasTexture {
    if (!TerrainTextureFactory._pathTurnLeft) TerrainTextureFactory._pathTurnLeft = TerrainTextureFactory._makePathTurn(false);
    return TerrainTextureFactory._pathTurnLeft;
  }

  // ── Per-type generators ──────────────────────────────────────────────

  private static _generate(cellType: CellType): THREE.CanvasTexture {
    switch (cellType) {
      case CellType.Ground: return TerrainTextureFactory._makeGrass();
      case CellType.Path:   return TerrainTextureFactory._makeDirt();
      case CellType.Spawn:  return TerrainTextureFactory._makeSpawn();
      case CellType.Base:   return TerrainTextureFactory._makeBase();
      case CellType.Tower:  return TerrainTextureFactory._makeStone();
      default: throw new Error(`TerrainTextureFactory: unknown CellType ${cellType as number}`);
    }
  }

  /** Grass — lush dark-green with lighter patches and tiny blade details. */
  private static _makeGrass(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;

    // Base fill
    ctx.fillStyle = "#2a5a24";
    ctx.fillRect(0, 0, s, s);

    // Large soft patches
    TerrainTextureFactory._patches(ctx, s, 24, 8, 22, [
      "rgba(60,110,50,0.25)",
      "rgba(34,74,28,0.3)",
      "rgba(80,140,65,0.15)",
    ]);

    // Medium noise
    TerrainTextureFactory._patches(ctx, s, 35, 3, 8, [
      "rgba(45,100,38,0.2)",
      "rgba(28,60,22,0.25)",
    ]);

    // Tiny grass blades (1–2px streaks)
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.fillStyle = `rgba(${70 + Math.random() * 40},${130 + Math.random() * 50},${50 + Math.random() * 30},0.25)`;
      ctx.fillRect(x, y, 1, 1 + Math.random() * 2);
    }

    return TerrainTextureFactory._toTexture(ctx);
  }

  /** Dirt — sandy tan with grain and small pebble dots. */
  private static _makeDirt(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;

    ctx.fillStyle = "#7a6545";
    ctx.fillRect(0, 0, s, s);

    TerrainTextureFactory._patches(ctx, s, 22, 8, 20, [
      "rgba(100,82,58,0.3)",
      "rgba(60,48,32,0.25)",
      "rgba(130,110,80,0.2)",
    ]);

    TerrainTextureFactory._patches(ctx, s, 40, 2, 6, [
      "rgba(90,72,48,0.3)",
      "rgba(120,100,70,0.2)",
    ]);

    // Pebble dots
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 0.5 + Math.random() * 1.5;
      ctx.fillStyle = `rgba(${50 + Math.random() * 40},${40 + Math.random() * 30},${25 + Math.random() * 20},0.3)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return TerrainTextureFactory._toTexture(ctx);
  }

  /** Stone — blue-gray cobblestone with subtle grid lines and cracks. */
  private static _makeStone(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;

    ctx.fillStyle = "#4a5a6a";
    ctx.fillRect(0, 0, s, s);

    // Cobble grid (faint dark lines every ~32px)
    ctx.strokeStyle = "rgba(30,40,50,0.35)";
    ctx.lineWidth = 1;
    const step = s / 4;
    for (let i = 1; i < 4; i++) {
      const offset = step * i + (Math.random() - 0.5) * 4;
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + (Math.random() - 0.5) * 6, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(s, offset + (Math.random() - 0.5) * 6);
      ctx.stroke();
    }

    TerrainTextureFactory._patches(ctx, s, 18, 6, 18, [
      "rgba(60,75,90,0.2)",
      "rgba(40,50,60,0.25)",
      "rgba(80,95,110,0.15)",
    ]);

    // Speckle
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.fillStyle = `rgba(${55 + Math.random() * 40},${65 + Math.random() * 40},${75 + Math.random() * 40},0.2)`;
      ctx.fillRect(x, y, 1, 1);
    }

    return TerrainTextureFactory._toTexture(ctx);
  }

  /** Spawn — dark crimson corrupted ground with hot embers. */
  private static _makeSpawn(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;

    ctx.fillStyle = "#3a1a1a";
    ctx.fillRect(0, 0, s, s);

    TerrainTextureFactory._patches(ctx, s, 20, 8, 22, [
      "rgba(80,25,25,0.3)",
      "rgba(50,15,15,0.35)",
      "rgba(110,35,20,0.15)",
    ]);

    // Hot ember dots
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 0.5 + Math.random() * 1;
      ctx.fillStyle = `rgba(${200 + Math.random() * 55},${60 + Math.random() * 40},${10 + Math.random() * 20},${0.15 + Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return TerrainTextureFactory._toTexture(ctx);
  }

  /** Base — warm golden stone with bright accents. */
  private static _makeBase(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;

    ctx.fillStyle = "#5a4020";
    ctx.fillRect(0, 0, s, s);

    TerrainTextureFactory._patches(ctx, s, 20, 8, 20, [
      "rgba(100,75,40,0.3)",
      "rgba(70,50,25,0.25)",
      "rgba(130,100,55,0.2)",
    ]);

    // Golden highlights
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 1 + Math.random() * 2;
      ctx.fillStyle = `rgba(${180 + Math.random() * 60},${140 + Math.random() * 50},${50 + Math.random() * 30},0.15)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return TerrainTextureFactory._toTexture(ctx);
  }

  // ── Directional path textures ──────────────────────────────────────

  /** Road runs top→bottom through the centre; grass borders on sides. */
  private static _makePathStraight(): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;
    const roadW = s * 0.50;
    const roadL = (s - roadW) / 2;
    const roadR = roadL + roadW;

    // Grass background
    ctx.fillStyle = "#2a5a24";
    ctx.fillRect(0, 0, s, s);
    TerrainTextureFactory._patches(ctx, s, 12, 4, 12, ["rgba(60,110,50,0.25)", "rgba(34,74,28,0.3)"]);

    // Road surface
    ctx.fillStyle = "#7a6545";
    ctx.fillRect(roadL, 0, roadW, s);
    TerrainTextureFactory._patches(ctx, s, 20, 2, 6, ["rgba(90,72,48,0.25)", "rgba(110,90,65,0.2)"]);

    // Pebbles on road only
    for (let i = 0; i < 40; i++) {
      const x = roadL + Math.random() * roadW;
      const y = Math.random() * s;
      ctx.fillStyle = `rgba(${50 + Math.random() * 30},${40 + Math.random() * 25},${30 + Math.random() * 15},0.25)`;
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + Math.random() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Edge lines (subtle)
    ctx.strokeStyle = "rgba(40,30,20,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(roadL, 0);
    ctx.lineTo(roadL, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(roadR, 0);
    ctx.lineTo(roadR, s);
    ctx.stroke();

    return TerrainTextureFactory._toTexture(ctx);
  }

  /**
   * Quarter-annulus road turning from the bottom edge toward one side.
   * `right = true` → bottom→right curve (center at bottom-right corner).
   * `right = false` → bottom→left curve (center at bottom-left corner).
   */
  private static _makePathTurn(right: boolean): THREE.CanvasTexture {
    const ctx = TerrainTextureFactory._canvas();
    const s = TerrainTextureFactory.SIZE;
    const roadW = s * 0.50;
    const innerR = (s - roadW) / 2;
    const outerR = (s + roadW) / 2;
    const cx = right ? s : 0;
    const cy = s;

    // Grass background
    ctx.fillStyle = "#2a5a24";
    ctx.fillRect(0, 0, s, s);
    TerrainTextureFactory._patches(ctx, s, 12, 4, 12, ["rgba(60,110,50,0.25)", "rgba(34,74,28,0.3)"]);

    // Road surface (quarter-annulus)
    ctx.fillStyle = "#7a6545";
    ctx.beginPath();
    if (right) {
      ctx.arc(cx, cy, outerR, Math.PI, Math.PI * 1.5);
      ctx.arc(cx, cy, innerR, Math.PI * 1.5, Math.PI, true);
    } else {
      ctx.arc(cx, cy, outerR, Math.PI * 1.5, Math.PI * 2);
      ctx.arc(cx, cy, innerR, Math.PI * 2, Math.PI * 1.5, true);
    }
    ctx.closePath();
    ctx.fill();

    // Pebbles on road area
    for (let i = 0; i < 35; i++) {
      const angle = (right ? Math.PI : Math.PI * 1.5) + Math.random() * (Math.PI / 2);
      const dist = innerR + Math.random() * (outerR - innerR);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      if (px < 0 || px > s || py < 0 || py > s) continue;
      ctx.fillStyle = `rgba(${50 + Math.random() * 30},${40 + Math.random() * 25},${30 + Math.random() * 15},0.25)`;
      ctx.beginPath();
      ctx.arc(px, py, 0.5 + Math.random() * 1.0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Edge arcs
    ctx.strokeStyle = "rgba(40,30,20,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (right) {
      ctx.arc(cx, cy, innerR, Math.PI, Math.PI * 1.5);
    } else {
      ctx.arc(cx, cy, innerR, Math.PI * 1.5, Math.PI * 2);
    }
    ctx.stroke();
    ctx.beginPath();
    if (right) {
      ctx.arc(cx, cy, outerR, Math.PI, Math.PI * 1.5);
    } else {
      ctx.arc(cx, cy, outerR, Math.PI * 1.5, Math.PI * 2);
    }
    ctx.stroke();

    return TerrainTextureFactory._toTexture(ctx);
  }

  // ── Shared helpers ───────────────────────────────────────────────────

  /** Create a fresh 128 × 128 2D canvas context. */
  private static _canvas(): CanvasRenderingContext2D {
    const canvas = document.createElement("canvas");
    canvas.width = TerrainTextureFactory.SIZE;
    canvas.height = TerrainTextureFactory.SIZE;
    return canvas.getContext("2d")!;
  }

  /** Scatter soft circular patches onto the canvas. */
  private static _patches(ctx: CanvasRenderingContext2D, size: number, count: number, minR: number, maxR: number, styles: string[]): void {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = minR + Math.random() * (maxR - minR);
      ctx.fillStyle = styles[Math.floor(Math.random() * styles.length)]!;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Convert a 2D context's canvas into a repeating THREE texture. */
  private static _toTexture(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
