import * as THREE from "three";
import type { ICard } from "../models/Card";
import { Suit, SUIT_SYMBOL } from "../constants/Suit";
import { SuitRules } from "../utilities/SuitRules";
import { Rank, RANK_LABEL } from "../constants/Rank";

export interface CardVisualConfig {
  readonly width: number;
  readonly height: number;
  readonly backColor: number;
  readonly faceBackground: number;
  readonly redColor: number;
  readonly blackColor: number;
}

const FACE_LIFT_Y = 0.02;

// Composition target dimensions for the per-card front canvas. Chosen
// to match the source `card-front.png` (256×364) so the PNG drops in
// without resampling, and tall enough that the rank/suit glyphs stay
// sharp at the typical board-camera framing.
const FRONT_CANVAS_W = 256;
const FRONT_CANVAS_H = 364;

// Cached rank/suit glyph canvases. Each glyph is rendered once into
// an off-screen canvas with a neutral fill (#000) and an alpha mask;
// every card that needs the glyph copies it through `drawTinted`,
// which preserves the alpha mask and reflows the colour via a
// `source-in` composite. Renders the expensive font/text raster
// exactly once per rank and once per suit for the lifetime of the
// page, regardless of how many cards are created.
const rankGlyphCache = new Map<Rank, HTMLCanvasElement>();
const suitGlyphCache = new Map<Suit, HTMLCanvasElement>();

const RANK_GLYPH_W = 80;
const RANK_GLYPH_H = 96;
const SUIT_GLYPH_W = 80;
const SUIT_GLYPH_H = 96;
const CENTER_SUIT_GLYPH_W = 200;
const CENTER_SUIT_GLYPH_H = 220;

const centerSuitGlyphCache = new Map<Suit, HTMLCanvasElement>();

/**
 * Visual for a single card — two planes (front + back) on the XZ plane, one
 * shown at a time based on faceUp state. No game logic. Cards live as
 * children of the BoardView, positioned by the layout's stackingOffset.
 *
 * Texture pipeline:
 * - Back: the loaded `card-back` PNG is used directly. All cards share
 *   the same GPU texture instance.
 * - Front: a per-card canvas is composited from (1) the loaded
 *   `card-front` PNG as the body and (2) cached rank/suit glyph
 *   canvases tinted to the suit colour on copy. The PNG and the
 *   13 + 4 + 4 glyph canvases are reused across every card; only
 *   the final composite texture is per-card.
 */
export class CardObject extends THREE.Group {
  public readonly cardId: number;

  private readonly _front: THREE.Mesh;
  private readonly _back: THREE.Mesh;
  private readonly _frontTexture: THREE.CanvasTexture;
  // Held by `AssetManager`; we just reference it and never dispose.
  private readonly _backTextureShared: THREE.Texture;

  public constructor(card: ICard, config: CardVisualConfig, frontBodyTexture: THREE.Texture, backTexture: THREE.Texture) {
    super();
    this.cardId = card.id;
    this.name = `Card(${card.id})`;

    const geometry = new THREE.PlaneGeometry(config.width, config.height);

    this._frontTexture = CardObject.createFrontTexture(card, config, frontBodyTexture);
    const frontMaterial = new THREE.MeshBasicMaterial({
      map: this._frontTexture,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this._front = new THREE.Mesh(geometry, frontMaterial);
    this._front.rotation.x = -Math.PI / 2;
    this._front.position.y = FACE_LIFT_Y;
    this._front.userData = { cardId: card.id };
    this.add(this._front);

    this._backTextureShared = backTexture;
    const backMaterial = new THREE.MeshBasicMaterial({
      map: backTexture,
      transparent: false,
      side: THREE.DoubleSide,
    });
    this._back = new THREE.Mesh(geometry, backMaterial);
    this._back.rotation.x = -Math.PI / 2;
    this._back.position.y = FACE_LIFT_Y;
    this._back.userData = { cardId: card.id };
    this.add(this._back);

    this.setFaceUp(card.faceUp);
  }

  public setFaceUp(faceUp: boolean): void {
    this._front.visible = faceUp;
    this._back.visible = !faceUp;
  }

  /** Meshes the parent view should include in pointer raycasts. Face-down
   *  cards return an empty list so they cannot be picked up. */
  public getPickableMeshes(): readonly THREE.Mesh[] {
    return this._front.visible ? [this._front] : [];
  }

  /** Meshes for drop-target hit-testing — whichever face is currently
   *  visible. Unlike {@link getPickableMeshes}, face-down cards still
   *  contribute because the user may legitimately drop on them. */
  public getHitTestMeshes(): readonly THREE.Mesh[] {
    if (this._front.visible) return [this._front];
    if (this._back.visible) return [this._back];
    return [];
  }

  public dispose(): void {
    this._front.geometry.dispose();
    (this._front.material as THREE.Material).dispose();
    this._back.geometry.dispose();
    (this._back.material as THREE.Material).dispose();
    this._frontTexture.dispose();
    // _backTextureShared is owned by AssetManager; do not dispose.
    void this._backTextureShared;
  }

  private static createFrontTexture(card: ICard, config: CardVisualConfig, bodyTexture: THREE.Texture): THREE.CanvasTexture {
    const W = FRONT_CANVAS_W;
    const H = FRONT_CANVAS_H;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CardObject: 2d canvas context unavailable");

    // 1) Card body: the loaded PNG, drawn full-bleed.
    const bodyImage = bodyTexture.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
    if (bodyImage) {
      ctx.drawImage(bodyImage, 0, 0, W, H);
    } else {
      // Fall back to a flat fill if the asset image hasn't resolved
      // for some reason — keeps the card readable rather than blank.
      ctx.fillStyle = `#${config.faceBackground.toString(16).padStart(6, "0")}`;
      ctx.fillRect(0, 0, W, H);
    }

    const tintHex = `#${(SuitRules.isRed(card.suit) ? config.redColor : config.blackColor).toString(16).padStart(6, "0")}`;
    const rankGlyph = CardObject.getRankGlyph(card.rank);
    const suitGlyph = CardObject.getSuitGlyph(card.suit);
    const centerSuitGlyph = CardObject.getCenterSuitGlyph(card.suit);

    // 2) Top-left corner: rank above suit.
    CardObject.drawTinted(ctx, rankGlyph, 14, 14, tintHex);
    CardObject.drawTinted(ctx, suitGlyph, 18, 14 + RANK_GLYPH_H - 8, tintHex);

    // 3) Bottom-right corner: same pair, rotated 180°.
    ctx.save();
    ctx.translate(W - 14, H - 14);
    ctx.rotate(Math.PI);
    CardObject.drawTinted(ctx, rankGlyph, 0, 0, tintHex);
    CardObject.drawTinted(ctx, suitGlyph, 4, RANK_GLYPH_H - 8, tintHex);
    ctx.restore();

    // 4) Center suit (large).
    CardObject.drawTinted(ctx, centerSuitGlyph, (W - CENTER_SUIT_GLYPH_W) / 2, (H - CENTER_SUIT_GLYPH_H) / 2, tintHex);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  private static getRankGlyph(rank: Rank): HTMLCanvasElement {
    const cached = rankGlyphCache.get(rank);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = RANK_GLYPH_W;
    canvas.height = RANK_GLYPH_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CardObject: 2d canvas context unavailable");
    ctx.fillStyle = "#000000";
    ctx.font = "bold 72px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(RANK_LABEL[rank], 0, 0);
    rankGlyphCache.set(rank, canvas);
    return canvas;
  }

  private static getSuitGlyph(suit: Suit): HTMLCanvasElement {
    const cached = suitGlyphCache.get(suit);
    if (cached) return cached;
    const canvas = CardObject.renderSuitCanvas(suit, SUIT_GLYPH_W, SUIT_GLYPH_H, 56);
    suitGlyphCache.set(suit, canvas);
    return canvas;
  }

  private static getCenterSuitGlyph(suit: Suit): HTMLCanvasElement {
    const cached = centerSuitGlyphCache.get(suit);
    if (cached) return cached;
    const canvas = CardObject.renderSuitCanvas(suit, CENTER_SUIT_GLYPH_W, CENTER_SUIT_GLYPH_H, 180);
    centerSuitGlyphCache.set(suit, canvas);
    return canvas;
  }

  private static renderSuitCanvas(suit: Suit, w: number, h: number, fontSize: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CardObject: 2d canvas context unavailable");
    ctx.fillStyle = "#000000";
    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(SUIT_SYMBOL[suit], w / 2, h / 2);
    return canvas;
  }

  /**
   * Copy `source` onto `targetCtx` at `(x, y)`, recoloured to `colorHex`.
   * Uses a throwaway intermediate canvas + `source-in` composite so the
   * source's alpha mask is preserved while the rasterised pixels are
   * replaced with the target colour. The intermediate stays out of the
   * cache because it is per-tint, not per-glyph.
   */
  private static drawTinted(targetCtx: CanvasRenderingContext2D, source: HTMLCanvasElement, x: number, y: number, colorHex: string): void {
    const intermediate = document.createElement("canvas");
    intermediate.width = source.width;
    intermediate.height = source.height;
    const ictx = intermediate.getContext("2d");
    if (!ictx) return;
    ictx.drawImage(source, 0, 0);
    ictx.globalCompositeOperation = "source-in";
    ictx.fillStyle = colorHex;
    ictx.fillRect(0, 0, source.width, source.height);
    targetCtx.drawImage(intermediate, x, y);
  }
}
