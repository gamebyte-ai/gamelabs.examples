import * as PIXI from "pixi.js";
import {
  HudViewBase,
  LabelComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type LabelComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { ILabelDemoView } from "./ILabelDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

/**
 * Live preview for the `LabelComponent` playground demo. Renders two
 * labels stacked vertically:
 *
 *   1. **Default skin** — bare text from the framework default style
 *      resolved via `UIComponentsStyleIds.Label`. The framework registers
 *      only a `text` slot, so this label has no backdrop.
 *   2. **Badge skin** — text wrapped in a 9-slice rounded panel via a
 *      per-call style override that points the `bg` slot at the
 *      playground's `CustomDropdownHeader` asset (the violet/amber
 *      rounded panel already shipped for the Dropdown demo). `border: 6`
 *      keeps the corners crisp; `scaleX/Y > 1` inflates the bg into a
 *      padded badge that stays centered around the text via anchor
 *      `(0.5, 0.5)`.
 *
 * Changing the demo text calls `setText` on both — the bare label
 * re-flows via `@pixi/layout`, the badge bg auto-resizes to the new
 * bounds. No teardown needed.
 */
export class LabelDemoView extends HudViewBase implements ILabelDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _column: VerticalLayoutComponent | null = null;
  private _defaultLabel: LabelComponent | null = null;
  private _badgeLabel: LabelComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _badgeOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private readonly _textChangedListeners = new Set<(which: "default" | "badge", text: string) => void>();

  private _text = "Ready";

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._buildColumn();
  }

  public setText(text: string): void {
    if (this._text === text) return;
    this._text = text;
    this._defaultLabel?.setText(text);
    this._badgeLabel?.setText(text);
    this._refreshOutlines();
    for (const cb of this._textChangedListeners) cb("default", text);
    for (const cb of this._textChangedListeners) cb("badge", text);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onTextChanged(cb: (which: "default" | "badge", text: string) => void): Unsubscribe {
    this._textChangedListeners.add(cb);
    return () => this._textChangedListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._textChangedListeners.clear();
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._badgeOutline?.removeFromParent();
    this._badgeOutline?.destroy();
    this._badgeOutline = null;
    this._column?.removeFromParent();
    this._column?.destroy({ children: true });
    this._column = null;
    this._defaultLabel = null;
    this._badgeLabel = null;
    this._config = null;
    super.preDestroy();
  }

  private _buildColumn(): void {
    const column = new VerticalLayoutComponent({
      gap: 32,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._column = column;
    this.addChild(column);

    column.addChild(this._buildSection("DEFAULT SKIN (bare text)", false));
    column.addChild(this._buildSection("BADGE SKIN (9-slice padded backdrop)", true));

    this._refreshOutlines();
  }

  private _buildSection(captionText: string, isBadge: boolean): VerticalLayoutComponent {
    const section = new VerticalLayoutComponent({
      gap: 8,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });

    const caption = new PIXI.Text({ text: captionText, style: SECTION_LABEL_STYLE });
    caption.layout = {};
    section.addChild(caption);

    // Default skin pulls the registered text style; badge skin overrides
    // the text colour for legibility against the violet panel and opts
    // into a 9-slice bg pointing at the playground's CustomDropdownHeader
    // asset (already loaded for the Dropdown demo).
    const labelStyle = isBadge
      ? this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
          text: { color: 0xfffbeb, fontSize: 16, fontWeight: "700" },
          bg: {
            textureId: UIPlaygroundAssetIds.CustomDropdownHeader,
            color: 0xffffff,
            alpha: 0.95,
            scaleX: 1.4,
            scaleY: 1.6,
            border: 6,
          },
        })
      : this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label);

    const label = new LabelComponent(this.assetLoader, labelStyle, {
      text: this._text,
      // Centered anchor puts the badge symmetrically around the text
      // when scaleX/Y > 1; same anchor works fine for the bare label
      // (anchor is just a pivot — the layout box still owns position).
      anchorX: isBadge ? 0.5 : 0,
      anchorY: isBadge ? 0.5 : 0,
    });

    if (isBadge) {
      this._badgeLabel = label;
    } else {
      this._defaultLabel = label;
    }
    section.addChild(label);

    return section;
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._badgeOutline?.removeFromParent();
    this._badgeOutline?.destroy();
    this._badgeOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultLabel) {
      this._defaultOutline = this._makeOutline(this._defaultLabel, 0, 0);
      this._defaultLabel.addChild(this._defaultOutline);
    }
    if (this._badgeLabel) {
      this._badgeOutline = this._makeOutline(this._badgeLabel, 0.5, 0.5);
      this._badgeLabel.addChild(this._badgeOutline);
    }
  }

  private _makeOutline(label: LabelComponent, anchorX: number, anchorY: number): PIXI.Graphics {
    const config = this._config!;
    // Pixi `Container` reports the rendered bounds via `width` / `height`
    // — bg dims when the label has a backdrop, text dims otherwise. For
    // anchored labels (badge uses 0.5/0.5) the local origin sits at the
    // centre, so shift the outline rect by `-w*ax, -h*ay` to align with
    // the rendered content regardless of pivot.
    const w = Math.max(1, Math.floor(label.width));
    const h = Math.max(1, Math.floor(label.height));
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(-w * anchorX, -h * anchorY, w, h).stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
