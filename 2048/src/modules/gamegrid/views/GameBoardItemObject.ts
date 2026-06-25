import * as THREE from "three";
import gsap from "gsap";
import type { IAssetManager, IWorldPointerInput, RectGridPreset } from "@gamebyte/gamelabsjs";
import { GridItemObject, type IGridObjectListener } from "@gamebyte/gamelabsjs";
import { GameBoardItemObjectOptions } from "./GameBoardItemObjectOptions.js";

type TileColors = { bg: string; fg: string };

const TILE_PALETTE: Record<number, TileColors> = {
  2:    { bg: "#eee4da", fg: "#776e65" },
  4:    { bg: "#ede0c8", fg: "#776e65" },
  8:    { bg: "#f2b179", fg: "#f9f6f2" },
  16:   { bg: "#f59563", fg: "#f9f6f2" },
  32:   { bg: "#f67c5f", fg: "#f9f6f2" },
  64:   { bg: "#f65e3b", fg: "#f9f6f2" },
  128:  { bg: "#edcf72", fg: "#f9f6f2" },
  256:  { bg: "#edcc61", fg: "#f9f6f2" },
  512:  { bg: "#edc850", fg: "#f9f6f2" },
  1024: { bg: "#edc53f", fg: "#f9f6f2" },
  2048: { bg: "#edc22e", fg: "#f9f6f2" },
};
const FALLBACK_COLORS: TileColors = { bg: "#3c3a32", fg: "#f9f6f2" };

export class GameBoardItemObject extends GridItemObject {
  private static readonly QUAD_Y = 0.05;
  private static readonly TEXTURE_SIZE = 256;

  public declare readonly preset: RectGridPreset;

  private _mesh: THREE.Mesh | null = null;
  private _texture: THREE.CanvasTexture | null = null;

  public constructor(options: GameBoardItemObjectOptions, pointerListener: IGridObjectListener, inputManager: IWorldPointerInput | null, assetManager?: IAssetManager | null) {
    super(options, pointerListener, inputManager, assetManager);
  }

  public get value(): number {
    return (this._options as GameBoardItemObjectOptions).value;
  }

  protected override createVisual(): void {
    const value = (this._options as GameBoardItemObjectOptions).value;
    const size = Math.min(this.preset.columnSize, this.preset.rowSize) * 0.92;

    this._texture = this._buildTileTexture(value);
    const geom = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({ map: this._texture, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, GameBoardItemObject.QUAD_Y, 0);
    this.add(mesh);
    this._mesh = mesh;
  }

  protected override createCollider(): void {}

  public killAnimations(): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.position);
    gsap.killTweensOf(this.scale);
  }

  public disposeVisual(): void {
    if (this._mesh) {
      const mat = this._mesh.material as THREE.MeshBasicMaterial;
      mat.dispose();
      this._mesh.geometry.dispose();
      this._mesh = null;
    }
    if (this._texture) {
      this._texture.dispose();
      this._texture = null;
    }
  }

  private _buildTileTexture(value: number): THREE.CanvasTexture {
    const size = GameBoardItemObject.TEXTURE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");

    const colors = TILE_PALETTE[value] ?? FALLBACK_COLORS;

    // Rounded rect background.
    const padding = 8;
    const w = size - padding * 2;
    const h = size - padding * 2;
    const radius = 24;
    ctx.fillStyle = colors.bg;
    this._roundedRect(ctx, padding, padding, w, h, radius);
    ctx.fill();

    // Value text.
    ctx.fillStyle = colors.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = this._fontSizeFor(value);
    ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(value.toString(), size / 2, size / 2 + fontSize * 0.05);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  private _fontSizeFor(value: number): number {
    if (value < 100) return 130;
    if (value < 1000) return 110;
    if (value < 10000) return 86;
    return 70;
  }

  private _roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
