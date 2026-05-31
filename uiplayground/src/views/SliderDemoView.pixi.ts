import * as PIXI from "pixi.js";
import {
  HorizontalLayoutComponent,
  HudViewBase,
  SliderComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type SliderComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { ISliderDemoView } from "./ISliderDemoView.js";

/** Default thumb radius matches `SliderComponent`'s constructor default. */
const SLIDER_THUMB_RADIUS = 10;

// ── RGB-section geometry ──────────────────────────────────────────────
const RGB_TRACK_WIDTH = 160;
const RGB_THUMB_RADIUS = 10;
const RGB_LABEL_WIDTH = 14;
const RGB_VALUE_WIDTH = 36;
const RGB_ROW_GAP = 8;
const RGB_SECTION_GAP = 10;
const RGB_SWATCH_SIZE = 60;

const RGB_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xe8eef6,
  fontSize: 14,
  fontWeight: "700",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};
const RGB_VALUE_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3e635,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const RGB_HEX_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xe8eef6,
  fontSize: 14,
  fontWeight: "700",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 18,
};

type RgbChannel = "r" | "g" | "b";
const RGB_CHANNEL_COLOR: Readonly<Record<RgbChannel, number>> = {
  r: 0xef4444,
  g: 0x22c55e,
  b: 0x3b82f6,
};

/**
 * Live preview for the `SliderComponent` playground demo.
 *
 * Most prop changes rebuild the underlying slider instance because
 * `SliderComponent`'s constructor-only options (track width, min/max,
 * step, colors) cannot be mutated after construction.
 *
 * Centring: handled by the parent stage container.
 *
 * Outline: drawn at `[0, -thumbRadius] → [trackWidth, +thumbRadius]`,
 * matching the slider's actual visible bounds (the track sits centered
 * on y=0; the thumb extends ±thumbRadius vertically).
 *
 * Below the live single slider, a self-contained RGB demo composes
 * three sliders (R / G / B, each 0–255) into a single colour output:
 * a swatch updates in real time and the rgb / hex values are shown
 * beside it. The RGB section is independent of the controls panel —
 * it's a fixed fixture demonstrating multi-slider composition.
 */
export class SliderDemoView extends HudViewBase implements ISliderDemoView {
  private _config: UIPlaygroundConfig | null = null;
  private _slider: SliderComponent | null = null;
  private _outline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _changeUnsub: Unsubscribe | null = null;
  private readonly _changeListeners = new Set<(value: number) => void>();

  // Mutable props.
  private _trackWidth = 240;
  private _min = 0;
  private _max = 1;
  private _stepped = false;
  private _value = 0.5;

  // RGB section (independent of the controls panel).
  private readonly _rgb: { r: number; g: number; b: number } = { r: 128, g: 128, b: 128 };
  private _rgbSection: VerticalLayoutComponent | null = null;
  private _swatch: PIXI.Graphics | null = null;
  private _hexText: PIXI.Text | null = null;
  private readonly _rgbValueTexts: Partial<Record<RgbChannel, PIXI.Text>> = {};
  private readonly _rgbUnsubs: Unsubscribe[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    // Stack the live single slider on top, the RGB demo below.
    this.layout = { flexDirection: "column", gap: 32, alignItems: "center" };
    this._rebuildSlider();
    this._buildRgbSection();
  }

  public setTrackWidth(trackWidth: number): void {
    if (this._trackWidth === trackWidth) return;
    this._trackWidth = trackWidth;
    this._rebuildSlider();
  }

  public setRange(min: number, max: number): void {
    if (this._min === min && this._max === max) return;
    this._min = min;
    this._max = max;
    this._value = min;
    this._rebuildSlider();
  }

  public setStepped(stepped: boolean): void {
    if (this._stepped === stepped) return;
    this._stepped = stepped;
    this._rebuildSlider();
  }

  public setValue(value: number): void {
    this._value = value;
    this._slider?.setValue(value);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutline();
  }

  public onChange(cb: (value: number) => void): Unsubscribe {
    this._changeListeners.add(cb);
    return () => this._changeListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._changeListeners.clear();
    this._changeUnsub?.();
    this._changeUnsub = null;
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    this._slider?.removeFromParent();
    this._slider?.destroy();
    this._slider = null;
    for (const u of this._rgbUnsubs) u();
    this._rgbUnsubs.length = 0;
    this._rgbSection?.removeFromParent();
    this._rgbSection?.destroy({ children: true });
    this._rgbSection = null;
    this._swatch = null;
    this._hexText = null;
    this._rgbValueTexts.r = undefined;
    this._rgbValueTexts.g = undefined;
    this._rgbValueTexts.b = undefined;
    this._config = null;
    super.preDestroy();
  }

  private _fireChange(value: number): void {
    this._value = value;
    for (const cb of this._changeListeners) cb(value);
  }

  private _rebuildSlider(): void {
    this._changeUnsub?.();
    this._changeUnsub = null;
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    this._slider?.removeFromParent();
    this._slider?.destroy();

    const stepSize = this._stepped ? (this._max - this._min) / 10 : 0;
    // Live demo slider intentionally uses the framework default skin
    // — no per-call style override — so the demo demonstrates what
    // apps get out of the box from `UIComponentsBinding`.
    const sliderStyle = this.styleManager.resolve<SliderComponentStyle>(UIComponentsStyleIds.Slider);
    this._slider = new SliderComponent(this.assetLoader, sliderStyle, {
      trackWidth: this._trackWidth,
      min: this._min,
      max: this._max,
      step: stepSize,
      value: this._value,
    });
    // `SliderComponent` doesn't set its own `.layout`, so without
    // this it would be skipped by `@pixi/layout` and rendered at its
    // own (0, 0) — same fix used in the controls panel's slider row.
    this._slider.layout = {
      width: this._trackWidth + SLIDER_THUMB_RADIUS * 2,
      height: SLIDER_THUMB_RADIUS * 2,
    };
    this._slider.position.set(SLIDER_THUMB_RADIUS, SLIDER_THUMB_RADIUS);
    this._changeUnsub = this._slider.onChange((value) => this._fireChange(value));
    this.addChild(this._slider);
    // Detach + re-attach the RGB section so it ends up after the
    // freshly added live slider in flex order. Pixi's `addChild` on
    // an existing same-parent child reorders the Pixi children list
    // but doesn't fire `"removed"` / `"added"`, so @pixi/layout's
    // yoga child indices wouldn't update otherwise.
    if (this._rgbSection) {
      this._rgbSection.removeFromParent();
      this.addChild(this._rgbSection);
    }
    this._refreshOutline();
  }

  // ── RGB demo section ───────────────────────────────────────────────

  private _buildRgbSection(): void {
    const section = new VerticalLayoutComponent({
      gap: RGB_SECTION_GAP,
      padding: 0,
      alignItems: "stretch",
      justifyContent: "flex-start",
    });

    section.addChild(this._buildRgbRow("R", "r"));
    section.addChild(this._buildRgbRow("G", "g"));
    section.addChild(this._buildRgbRow("B", "b"));
    section.addChild(this._buildSwatchRow());

    this._rgbSection = section;
    this.addChild(section);
    this._refreshSwatch();
  }

  private _buildRgbRow(label: string, channel: RgbChannel): HorizontalLayoutComponent {
    const row = new HorizontalLayoutComponent({
      gap: RGB_ROW_GAP,
      padding: 0,
      alignItems: "center",
    });

    const labelText = new PIXI.Text({ text: label, style: RGB_LABEL_STYLE });
    labelText.layout = { width: RGB_LABEL_WIDTH };
    row.addChild(labelText);

    const channelColor = RGB_CHANNEL_COLOR[channel];
    // Custom skin (neutral white textures) — Container.tint multiplies
    // it down to the channel colour without touching the lib defaults,
    // so all three rows share one skin and differ only by tint.
    const customStyle = this.styleManager.resolve<SliderComponentStyle>(UIComponentsStyleIds.Slider, {
      track: { textureId: UIPlaygroundAssetIds.CustomSliderTrack, border: 2 },
      fill: { textureId: UIPlaygroundAssetIds.CustomSliderFill, border: 2 },
      thumb: { textureId: UIPlaygroundAssetIds.CustomSliderThumb, border: 0 },
    });
    const slider = new SliderComponent(this.assetLoader, customStyle, {
      trackWidth: RGB_TRACK_WIDTH,
      min: 0,
      max: 255,
      step: 1,
      value: this._rgb[channel],
    });
    slider.tint = channelColor;
    // Same layout-box + position-shift trick as the live slider.
    slider.layout = {
      width: RGB_TRACK_WIDTH + RGB_THUMB_RADIUS * 2,
      height: RGB_THUMB_RADIUS * 2,
    };
    slider.position.set(RGB_THUMB_RADIUS, RGB_THUMB_RADIUS);
    row.addChild(slider);

    const valueText = new PIXI.Text({ text: `${this._rgb[channel]}`, style: RGB_VALUE_STYLE });
    valueText.layout = { width: RGB_VALUE_WIDTH };
    row.addChild(valueText);
    this._rgbValueTexts[channel] = valueText;

    this._rgbUnsubs.push(
      slider.onChange((value) => this._onRgbChannelChanged(channel, value)),
    );
    return row;
  }

  private _buildSwatchRow(): HorizontalLayoutComponent {
    const row = new HorizontalLayoutComponent({ gap: 12, padding: 0, alignItems: "center" });

    this._swatch = new PIXI.Graphics();
    this._swatch.layout = { width: RGB_SWATCH_SIZE, height: RGB_SWATCH_SIZE };
    row.addChild(this._swatch);

    this._hexText = new PIXI.Text({ text: "", style: RGB_HEX_STYLE });
    this._hexText.layout = {};
    row.addChild(this._hexText);

    return row;
  }

  private _onRgbChannelChanged(channel: RgbChannel, value: number): void {
    const v = Math.round(value);
    if (this._rgb[channel] === v) return;
    this._rgb[channel] = v;
    const valueText = this._rgbValueTexts[channel];
    if (valueText) valueText.text = `${v}`;
    this._refreshSwatch();
  }

  private _refreshSwatch(): void {
    if (!this._swatch || !this._hexText) return;
    const { r, g, b } = this._rgb;
    const color = (r << 16) | (g << 8) | b;
    this._swatch.clear();
    this._swatch
      .roundRect(0, 0, RGB_SWATCH_SIZE, RGB_SWATCH_SIZE, 6)
      .fill({ color })
      .stroke({ color: 0x475569, width: 1 });
    const hex = `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
    this._hexText.text = `${hex}\nrgb(${r}, ${g}, ${b})`;
  }

  private _refreshOutline(): void {
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    if (!this._outlineVisible || !this._slider || !this._config) return;

    const outline = new PIXI.Graphics();
    outline.eventMode = "none";
    outline
      .rect(0, -SLIDER_THUMB_RADIUS, this._trackWidth, SLIDER_THUMB_RADIUS * 2)
      .stroke({ color: this._config.outlineColor, width: this._config.outlineWidth });
    this._slider.addChild(outline);
    this._outline = outline;
  }
}
