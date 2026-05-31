import * as PIXI from "pixi.js";
import {
  HorizontalLayoutComponent,
  HudViewBase,
  ImageComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type ImageComponentStyle,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import {
  IMAGE_CONTENT_PRESETS,
  type ImageContentPreset,
  type ImageFitPreset,
} from "../constants/DemoPresets.js";
import type { IImageDemoView } from "./IImageDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

const BOX_WIDTH = 200;
const BOX_HEIGHT = 200;
const CUSTOM_TINT = 0xf59e0b; // amber, mirrors the playground's other "custom skin" demos.

/**
 * Live preview for the `ImageComponent` playground demo. Renders two
 * images side-by-side:
 *
 *   1. **Default skin** — `ImageComponent` constructed with the
 *      framework default style resolved from `UIComponentsStyleIds.Image`
 *      (untinted, alpha 1).
 *   2. **Custom skin** — same texture, same fit / padding, but the
 *      style override sets `image.color` to amber so the StyleManager-
 *      driven tinting flow is visible at a glance.
 *
 * The texture itself is canvas-generated content cycled by the
 * `content` control — the user picks "wide" / "square" / "tall" to
 * see how `fit` / `padding` re-scale and re-align the source texture
 * inside the fixed 200 × 200 box.
 */
export class ImageDemoView extends HudViewBase implements IImageDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _row: HorizontalLayoutComponent | null = null;
  private _defaultImage: ImageComponent | null = null;
  private _customImage: ImageComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;

  // Mutable props.
  private _fit: ImageFitPreset = "contain";
  private _padding = 1;
  private _contentIndex = 0;
  /** Alpha override applied to the custom skin only — default skin stays at the registered framework alpha (1). */
  private _customAlpha = 1;
  /** Pre-built test textures, one per `IMAGE_CONTENT_PRESETS` entry. Built once at construction; index-looked-up by `setContent`. */
  private readonly _contentTextures: PIXI.Texture[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._generateContentTextures();
    this._buildRow();
  }

  public setFit(fit: ImageFitPreset): void {
    if (this._fit === fit) return;
    this._fit = fit;
    this._rebuildImages();
  }

  public setPadding(padding: number): void {
    if (this._padding === padding) return;
    this._padding = padding;
    this._rebuildImages();
  }

  public setContent(content: ImageContentPreset): void {
    const index = IMAGE_CONTENT_PRESETS.indexOf(content);
    if (index < 0 || this._contentIndex === index) return;
    this._contentIndex = index;
    // Texture swap doesn't need a rebuild — `setTexture` re-runs the
    // fit math against the current layout box. Both images share the
    // same pre-built texture reference so the swap is a single setter.
    const tex = this._contentTextures[index]!;
    this._defaultImage?.setTexture(tex);
    this._customImage?.setTexture(tex);
  }

  public setCustomAlpha(alpha: number): void {
    if (this._customAlpha === alpha) return;
    this._customAlpha = alpha;
    // Style override changes need a fresh `styleManager.resolve(...)`,
    // which means rebuilding the affected component. Mirrors the
    // `BackgroundDemoView` pattern for live overlay-alpha tweaks.
    this._rebuildImages();
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public override preDestroy(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._row?.removeFromParent();
    this._row?.destroy({ children: true });
    this._row = null;
    this._defaultImage = null;
    this._customImage = null;
    for (const tex of this._contentTextures) tex.destroy(true);
    this._contentTextures.length = 0;
    this._config = null;
    super.preDestroy();
  }

  private _buildRow(): void {
    // Two images side-by-side. Top-aligned so the captions line up.
    const row = new HorizontalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._row = row;
    this.addChild(row);
    this._rebuildImages();
  }

  private _generateContentTextures(): void {
    if (this._contentTextures.length > 0) return;
    for (const preset of IMAGE_CONTENT_PRESETS) {
      this._contentTextures.push(this._makeContentTexture(preset));
    }
  }

  private _rebuildImages(): void {
    if (!this._row) return;

    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;

    this._row.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._defaultImage = null;
    this._customImage = null;

    this._row.addChild(this._buildSection("DEFAULT SKIN (untinted)", false));
    this._row.addChild(this._buildSection("CUSTOM SKIN (amber tint)", true));

    this._refreshOutlines();
  }

  private _buildSection(captionText: string, isCustom: boolean): VerticalLayoutComponent {
    const section = new VerticalLayoutComponent({
      gap: 6,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });

    const caption = new PIXI.Text({ text: captionText, style: SECTION_LABEL_STYLE });
    caption.layout = {};
    section.addChild(caption);

    // Default skin pulls the registered defaults; custom skin overrides
    // both `image.color` (amber tint) and `image.alpha` (driven live
    // by the customAlpha slider) — texture content stays the same
    // pre-built canvas texture cycled by the content control.
    const imageStyle = isCustom
      ? this.styleManager.resolve<ImageComponentStyle>(UIComponentsStyleIds.Image, {
          image: { color: CUSTOM_TINT, alpha: this._customAlpha },
        })
      : this.styleManager.resolve<ImageComponentStyle>(UIComponentsStyleIds.Image);

    const image = new ImageComponent(this.assetLoader, imageStyle, {
      width: BOX_WIDTH,
      height: BOX_HEIGHT,
      fit: this._fit,
      padding: this._padding,
    });
    const tex = this._contentTextures[this._contentIndex];
    if (tex) image.setTexture(tex);
    section.addChild(image);

    if (isCustom) {
      this._customImage = image;
    } else {
      this._defaultImage = image;
    }

    return section;
  }

  /**
   * Build a flat-coloured rounded-rect texture at the requested aspect
   * ratio. Mirrors the canvas-generated palette textures used in the
   * List demo — keeps the playground self-contained without loading
   * real assets.
   */
  private _makeContentTexture(content: ImageContentPreset): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = content.width;
    canvas.height = content.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return PIXI.Texture.WHITE;

    const radius = 12;
    const w = content.width;
    const h = content.height;
    ctx.fillStyle = `#${content.color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Centred white label so the user can see how the texture is
    // positioned + scaled by each fit mode (the dot in the centre also
    // makes "stretch" obviously asymmetric for non-square sources).
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(content.label.toUpperCase(), w / 2, h / 2);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + 18, 4, 0, Math.PI * 2);
    ctx.fill();

    return PIXI.Texture.from(canvas);
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultImage) {
      this._defaultOutline = this._makeOutline();
      this._defaultImage.addChild(this._defaultOutline);
    }
    if (this._customImage) {
      this._customOutline = this._makeOutline();
      this._customImage.addChild(this._customOutline);
    }
  }

  private _makeOutline(): PIXI.Graphics {
    const config = this._config!;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(0, 0, BOX_WIDTH, BOX_HEIGHT).stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
