import * as PIXI from "pixi.js";
import {
  HorizontalLayoutComponent,
  HudViewBase,
  ScrollViewComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type ScrollViewComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import {
  SCROLL_VIEW_ITEM_PALETTE,
  type ScrollViewDirectionPreset,
} from "../constants/DemoPresets.js";
import type { IScrollViewDemoView } from "./IScrollViewDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

const VIEWPORT_WIDTH = 240;
const VIEWPORT_HEIGHT = 280;
const ITEM_SIZE = 48;
const ITEM_GAP = 8;
// Five columns of 48-px items with 8-px gaps span 272 px — wider than
// the 240-px viewport, so `"horizontal"` and `"both"` directions always
// have something to scroll. At the controller's default itemCount (30),
// the grid is 5×6 → 272 × 328 inside a 240 × 280 viewport, so both
// axes scroll out of the box.
const COLUMNS = 5;
// Custom skin proportions — the thumb is intentionally wider than the
// track so the two pieces visually separate (the thumb sits "on top of"
// the track instead of inside it).
const CUSTOM_TRACK_THICKNESS = 6;
const CUSTOM_THUMB_THICKNESS = 14;

/**
 * Live preview for the `ScrollViewComponent` playground demo. Renders
 * two scroll views side-by-side:
 *
 *   1. **Default skin** — framework default style resolved from
 *      `UIComponentsStyleIds.ScrollView` (invisible track + slate-blue
 *      rounded thumb at 0.6 alpha, matches the legacy look).
 *   2. **Custom skin** — per-call style override pointing at the
 *      playground's `UIPlaygroundAssetIds.CustomScrollView*` PNGs (light
 *      gray rounded thumb with a hamburger grip, sitting visually wider
 *      than its track).
 *
 * Direction / showScrollbar / wheelSpeed changes rebuild both scroll
 * views; itemCount mutates the existing content containers in-place
 * (items are added/removed without resetting the scroll position).
 * Outlines are drawn at each scroll view's fixed viewport bounds —
 * sibling of the masked content so they aren't clipped.
 */
export class ScrollViewDemoView extends HudViewBase implements IScrollViewDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _row: HorizontalLayoutComponent | null = null;
  private _defaultScroll: ScrollViewComponent | null = null;
  private _customScroll: ScrollViewComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _defaultScrollUnsub: Unsubscribe | null = null;
  private _customScrollUnsub: Unsubscribe | null = null;
  private readonly _scrollListeners = new Set<(which: "default" | "custom", x: number, y: number) => void>();

  private _direction: ScrollViewDirectionPreset = "vertical";
  private _itemCount = 30;
  private _showScrollbar = true;
  private _wheelSpeed = 50;
  private readonly _defaultItems: PIXI.Container[] = [];
  private readonly _customItems: PIXI.Container[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._buildRow();
  }

  public setDirection(direction: ScrollViewDirectionPreset): void {
    if (this._direction === direction) return;
    this._direction = direction;
    this._rebuildScrolls();
  }

  public setItemCount(count: number): void {
    if (count === this._itemCount) return;
    this._itemCount = count;
    this._syncItems(this._defaultScroll, this._defaultItems);
    this._syncItems(this._customScroll, this._customItems);
  }

  public setShowScrollbar(visible: boolean): void {
    if (this._showScrollbar === visible) return;
    this._showScrollbar = visible;
    this._rebuildScrolls();
  }

  public setWheelSpeed(speed: number): void {
    if (this._wheelSpeed === speed) return;
    this._wheelSpeed = speed;
    this._rebuildScrolls();
  }

  public scrollToStart(): void {
    this._defaultScroll?.scrollTo(0, 0);
    this._customScroll?.scrollTo(0, 0);
  }

  public scrollToEnd(): void {
    if (this._defaultScroll) {
      this._defaultScroll.scrollTo(this._defaultScroll.scrollableWidth, this._defaultScroll.scrollableHeight);
    }
    if (this._customScroll) {
      this._customScroll.scrollTo(this._customScroll.scrollableWidth, this._customScroll.scrollableHeight);
    }
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onScroll(cb: (which: "default" | "custom", x: number, y: number) => void): Unsubscribe {
    this._scrollListeners.add(cb);
    return () => this._scrollListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._scrollListeners.clear();
    this._defaultScrollUnsub?.();
    this._customScrollUnsub?.();
    this._defaultScrollUnsub = null;
    this._customScrollUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._destroyItems(this._defaultItems);
    this._destroyItems(this._customItems);
    this._row?.removeFromParent();
    this._row?.destroy({ children: true });
    this._row = null;
    this._defaultScroll = null;
    this._customScroll = null;
    this._config = null;
    super.preDestroy();
  }

  private _fireScroll(which: "default" | "custom", x: number, y: number): void {
    for (const cb of this._scrollListeners) cb(which, x, y);
  }

  private _destroyItems(items: PIXI.Container[]): void {
    for (const item of items) {
      item.removeFromParent();
      item.destroy({ children: true });
    }
    items.length = 0;
  }

  private _buildRow(): void {
    const row = new HorizontalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._row = row;
    this.addChild(row);
    this._rebuildScrolls();
  }

  private _rebuildScrolls(): void {
    if (!this._row) return;

    this._defaultScrollUnsub?.();
    this._customScrollUnsub?.();
    this._defaultScrollUnsub = null;
    this._customScrollUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._destroyItems(this._defaultItems);
    this._destroyItems(this._customItems);

    this._row.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._defaultScroll = null;
    this._customScroll = null;

    this._row.addChild(this._buildSection("DEFAULT SKIN (slate thumb)", false));
    this._row.addChild(this._buildSection("CUSTOM SKIN (gray grip thumb)", true));

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

    const style = isCustom
      ? this.styleManager.resolve<ScrollViewComponentStyle>(UIComponentsStyleIds.ScrollView, {
          // Reveal the track (default style sets alpha 0 for the legacy
          // "thumb only" look) and point both slots at the playground's
          // own PNGs.
          track: { textureId: UIPlaygroundAssetIds.CustomScrollViewTrack, alpha: 1 },
          thumb: { textureId: UIPlaygroundAssetIds.CustomScrollViewThumb, alpha: 1 },
        })
      : this.styleManager.resolve<ScrollViewComponentStyle>(UIComponentsStyleIds.ScrollView);

    const scroll = new ScrollViewComponent(this.assetLoader, style, {
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
      direction: this._direction,
      showScrollbar: this._showScrollbar,
      wheelSpeed: this._wheelSpeed,
      fillColor: 0x0b1220,
      fillAlpha: 1,
      // Custom skin: thumb is wider than its track AND a fixed-size
      // rounded square (thumbLength === thumbThickness). Default skin
      // keeps thumb == track and a proportional thumb length for the
      // legacy compact look.
      scrollbarThickness: isCustom ? CUSTOM_TRACK_THICKNESS : 4,
      thumbThickness: isCustom ? CUSTOM_THUMB_THICKNESS : 4,
      thumbLength: isCustom ? CUSTOM_THUMB_THICKNESS : undefined,
      scrollbarMargin: isCustom ? 6 : 2,
    });
    section.addChild(scroll);

    if (isCustom) {
      this._customScroll = scroll;
      this._customScrollUnsub = scroll.onScroll((x, y) => this._fireScroll("custom", x, y));
    } else {
      this._defaultScroll = scroll;
      this._defaultScrollUnsub = scroll.onScroll((x, y) => this._fireScroll("default", x, y));
    }

    const items = isCustom ? this._customItems : this._defaultItems;
    for (let i = 0; i < this._itemCount; i++) {
      const item = this._makeItem(i);
      scroll.content.addChild(item);
      items.push(item);
    }
    this._applyContentSize(scroll);

    return section;
  }

  /**
   * Trim or extend `items` in-place so the underlying scroll view keeps
   * its current scroll position. Mirrors the legacy demo's per-axis
   * grid layout — content size is computed from the known cell count
   * rather than `getLocalBounds()`.
   */
  private _syncItems(scroll: ScrollViewComponent | null, items: PIXI.Container[]): void {
    if (!scroll) return;
    while (items.length > this._itemCount) {
      const item = items.pop()!;
      item.removeFromParent();
      item.destroy({ children: true });
    }
    while (items.length < this._itemCount) {
      const item = this._makeItem(items.length);
      scroll.content.addChild(item);
      items.push(item);
    }
    this._applyContentSize(scroll);
  }

  private _applyContentSize(scroll: ScrollViewComponent): void {
    if (this._itemCount <= 0) {
      scroll.setContentSize(0, 0);
      return;
    }
    const cols = Math.min(this._itemCount, COLUMNS);
    const rows = Math.ceil(this._itemCount / COLUMNS);
    const w = cols * ITEM_SIZE + (cols - 1) * ITEM_GAP;
    const h = rows * ITEM_SIZE + (rows - 1) * ITEM_GAP;
    scroll.setContentSize(w, h);
  }

  private _makeItem(index: number): PIXI.Container {
    const container = new PIXI.Container();
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    container.position.set(col * (ITEM_SIZE + ITEM_GAP), row * (ITEM_SIZE + ITEM_GAP));

    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, ITEM_SIZE, ITEM_SIZE, 6).fill({
      color: SCROLL_VIEW_ITEM_PALETTE[index % SCROLL_VIEW_ITEM_PALETTE.length]!,
    });
    container.addChild(bg);

    const text = new PIXI.Text({
      text: `${index + 1}`,
      style: { fill: 0xffffff, fontSize: 14, fontWeight: "700" },
    });
    text.anchor.set(0.5);
    text.position.set(ITEM_SIZE / 2, ITEM_SIZE / 2);
    container.addChild(text);

    return container;
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultScroll) {
      this._defaultOutline = this._makeOutline();
      this._defaultScroll.addChild(this._defaultOutline);
    }
    if (this._customScroll) {
      this._customOutline = this._makeOutline();
      this._customScroll.addChild(this._customOutline);
    }
  }

  private _makeOutline(): PIXI.Graphics {
    const config = this._config!;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
      .stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
