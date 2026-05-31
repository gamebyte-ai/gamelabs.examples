import * as PIXI from "pixi.js";
import {
  HorizontalLayoutComponent,
  HudViewBase,
  ListComponent,
  ScrollViewComponent,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type IInstanceResolver,
  type ListComponentStyle,
  type ListItem,
  type ScrollViewComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import {
  SCROLL_VIEW_ITEM_PALETTE,
  type ListSelectionModePreset,
  type ListVariantPreset,
} from "../constants/DemoPresets.js";
import type { IListDemoView } from "./IListDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

const LIST_WIDTH = 240;
const TEXTURE_SIZE = 32;
/**
 * Fixed scroll-view viewport. Chosen so the default `itemCount = 6 ×
 * 36 = 216` fits without scrolling, but raising the slider to 8+
 * rows makes the scrollbar appear and the list scrolls inside the
 * viewport instead of pushing the panel taller.
 */
const LIST_VIEWPORT_HEIGHT = 240;

/**
 * Live preview for the `ListComponent` playground demo. Renders two
 * lists side-by-side:
 *
 *   1. **Default skin** — framework default style resolved from
 *      `UIComponentsStyleIds.List` (legacy slate-900 / slate-700 /
 *      indigo-700 row backgrounds shipped by `UIComponentsBinding`).
 *   2. **Custom skin** — per-call style override pointing at the
 *      playground's `UIPlaygroundAssetIds.CustomList*` PNGs (violet /
 *      amber palette, matches the Dropdown demo's custom skin).
 *
 * Variant / selectionMode / itemHeight rebuild both lists; itemCount
 * flows through to both via `setItems`. User taps on either list only
 * affect that list's selection (per-skin state). The `image` and
 * `text+image` variants use a small palette of canvas-generated
 * textures cycled per item index so the demo doesn't need to load
 * real assets.
 */
export class ListDemoView extends HudViewBase implements IListDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _row: HorizontalLayoutComponent | null = null;
  private _defaultList: ListComponent | null = null;
  private _customList: ListComponent | null = null;
  private _defaultScroll: ScrollViewComponent | null = null;
  private _customScroll: ScrollViewComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _defaultChangeUnsub: Unsubscribe | null = null;
  private _customChangeUnsub: Unsubscribe | null = null;
  private _defaultPressUnsub: Unsubscribe | null = null;
  private _customPressUnsub: Unsubscribe | null = null;
  private readonly _changeListeners = new Set<
    (which: "default" | "custom", selectedIds: readonly string[], selectedItems: readonly ListItem[]) => void
  >();
  private readonly _pressListeners = new Set<(which: "default" | "custom", id: string, item: ListItem) => void>();
  private readonly _paletteTextures: PIXI.Texture[] = [];

  // Mutable props (apply to both lists).
  private _variant: ListVariantPreset = "text";
  private _selectionMode: ListSelectionModePreset = "none";
  private _itemCount = 6;
  private _itemHeight = 36;
  // Per-skin selection — user taps on one list don't propagate to the
  // other. `clearSelection` programmatic action wipes both.
  private _defaultSelectedIds: readonly string[] = [];
  private _customSelectedIds: readonly string[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._generatePaletteTextures();
    this._buildRow();
  }

  public setVariant(variant: ListVariantPreset): void {
    if (this._variant === variant) return;
    this._variant = variant;
    this._rebuildLists();
  }

  public setSelectionMode(mode: ListSelectionModePreset): void {
    if (this._selectionMode === mode) return;
    this._selectionMode = mode;
    // Selection semantics change with mode; clear so the new components
    // start from a known empty state.
    this._defaultSelectedIds = [];
    this._customSelectedIds = [];
    this._rebuildLists();
  }

  public setItemCount(count: number): void {
    if (this._itemCount === count) return;
    this._itemCount = count;
    if (this._defaultList) {
      this._defaultList.setItems(this._buildItems());
      this._defaultSelectedIds = this._defaultList.selectedIds;
    }
    if (this._customList) {
      this._customList.setItems(this._buildItems());
      this._customSelectedIds = this._customList.selectedIds;
    }
    // Tell each wrapping ScrollView the new content extent. We can't use
    // `refresh()` here because it reads `content.getLocalBounds()`, and
    // the list's rows are still stacked at (0, 0) until Yoga's next
    // layout pass — `getLocalBounds()` would return one row's worth.
    // `setContentSize` skips the measurement entirely.
    const totalHeight = this._totalContentHeight();
    this._defaultScroll?.setContentSize(LIST_WIDTH, totalHeight);
    this._customScroll?.setContentSize(LIST_WIDTH, totalHeight);
    this._refreshOutlines();
  }

  private _totalContentHeight(): number {
    return this._itemCount * this._itemHeight;
  }

  public setItemHeight(height: number): void {
    if (this._itemHeight === height) return;
    this._itemHeight = height;
    this._rebuildLists();
  }

  public clearSelection(): void {
    this._defaultSelectedIds = [];
    this._customSelectedIds = [];
    this._defaultList?.setSelectedIds([]);
    this._customList?.setSelectedIds([]);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onChange(
    cb: (which: "default" | "custom", selectedIds: readonly string[], selectedItems: readonly ListItem[]) => void,
  ): Unsubscribe {
    this._changeListeners.add(cb);
    return () => this._changeListeners.delete(cb);
  }

  public onItemPress(cb: (which: "default" | "custom", id: string, item: ListItem) => void): Unsubscribe {
    this._pressListeners.add(cb);
    return () => this._pressListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._changeListeners.clear();
    this._pressListeners.clear();
    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultPressUnsub?.();
    this._customPressUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._defaultPressUnsub = null;
    this._customPressUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._row?.removeFromParent();
    this._row?.destroy({ children: true });
    this._row = null;
    this._defaultList = null;
    this._customList = null;
    this._defaultScroll = null;
    this._customScroll = null;
    for (const tex of this._paletteTextures) tex.destroy(true);
    this._paletteTextures.length = 0;
    this._config = null;
    super.preDestroy();
  }

  private _fireChange(which: "default" | "custom", ids: readonly string[], items: readonly ListItem[]): void {
    if (which === "custom") this._customSelectedIds = ids;
    else this._defaultSelectedIds = ids;
    for (const cb of this._changeListeners) cb(which, ids, items);
  }

  private _firePress(which: "default" | "custom", id: string, item: ListItem): void {
    for (const cb of this._pressListeners) cb(which, id, item);
  }

  private _generatePaletteTextures(): void {
    if (this._paletteTextures.length > 0) return;
    for (const color of SCROLL_VIEW_ITEM_PALETTE) {
      this._paletteTextures.push(this._makeColorTexture(color, TEXTURE_SIZE));
    }
  }

  private _makeColorTexture(color: number, size: number): PIXI.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return PIXI.Texture.WHITE;
    const radius = 6;
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    return PIXI.Texture.from(canvas);
  }

  private _buildItems(): readonly ListItem[] {
    const items: ListItem[] = [];
    for (let i = 0; i < this._itemCount; i++) {
      items.push({
        id: `item-${i}`,
        label: `Item ${i + 1}`,
        texture: this._paletteTextures[i % this._paletteTextures.length],
      });
    }
    return items;
  }

  private _buildRow(): void {
    // Two lists side-by-side. Top-aligned because the lists grow
    // downward and we want both columns to start at the same y.
    const row = new HorizontalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    this._row = row;
    this.addChild(row);
    this._rebuildLists();
  }

  private _rebuildLists(): void {
    if (!this._row) return;

    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultPressUnsub?.();
    this._customPressUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._defaultPressUnsub = null;
    this._customPressUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    // Scroll views live inside the section subtree — the
    // `removeChildren().destroy({ children: true })` chain below tears
    // them down. Just clear the references so we don't accidentally
    // dereference stale instances before the new sections build.
    this._defaultScroll = null;
    this._customScroll = null;

    this._row.removeChildren().forEach((c) => c.destroy({ children: true }));

    this._row.addChild(this._buildSection("DEFAULT SKIN (slate / indigo)", false));
    this._row.addChild(this._buildSection("CUSTOM SKIN (violet / amber)", true));

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
    // the three row-state slots with the playground's own asset ids.
    // The label TextStyle stays from the registered defaults since it
    // isn't overridden here.
    const listStyle = isCustom
      ? this.styleManager.resolve<ListComponentStyle>(UIComponentsStyleIds.List, {
          itemIdle: { textureId: UIPlaygroundAssetIds.CustomListItemIdle },
          itemHover: { textureId: UIPlaygroundAssetIds.CustomListItemHover },
          itemSelected: { textureId: UIPlaygroundAssetIds.CustomListItemSelected },
        })
      : this.styleManager.resolve<ListComponentStyle>(UIComponentsStyleIds.List);

    const initialSelected = isCustom ? this._customSelectedIds : this._defaultSelectedIds;
    const list = new ListComponent(this.assetLoader, listStyle, {
      width: LIST_WIDTH,
      itemHeight: this._itemHeight,
      variant: this._variant,
      selectionMode: this._selectionMode,
      items: this._buildItems(),
      selectedIds: initialSelected,
    });

    // Wrap the list in a fixed-viewport ScrollView so increasing
    // itemCount produces a scrollbar instead of pushing the section
    // taller. The list is added to `scroll.content` (the masked,
    // translatable inner container); the scroll view itself stays
    // at LIST_WIDTH × LIST_VIEWPORT_HEIGHT and participates in the
    // section's flex column.
    const scrollStyle = this.styleManager.resolve<ScrollViewComponentStyle>(UIComponentsStyleIds.ScrollView);
    const scroll = new ScrollViewComponent(this.assetLoader, scrollStyle, {
      width: LIST_WIDTH,
      height: LIST_VIEWPORT_HEIGHT,
      direction: "vertical",
    });
    scroll.content.addChild(list);
    // Set explicit content size; `refresh()` would read
    // `content.getLocalBounds()` which is wrong before Yoga's first
    // layout pass (rows are stacked at 0,0).
    scroll.setContentSize(LIST_WIDTH, this._totalContentHeight());

    if (isCustom) {
      this._customList = list;
      this._customScroll = scroll;
      this._customChangeUnsub = list.onChange((ids, items) => this._fireChange("custom", ids, items));
      this._customPressUnsub = list.onItemPress((id, item) => this._firePress("custom", id, item));
    } else {
      this._defaultList = list;
      this._defaultScroll = scroll;
      this._defaultChangeUnsub = list.onChange((ids, items) => this._fireChange("default", ids, items));
      this._defaultPressUnsub = list.onItemPress((id, item) => this._firePress("default", id, item));
    }
    section.addChild(scroll);

    return section;
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    // Outline marks the scroll viewport (the fixed visible rectangle);
    // attached to the scroll view itself rather than `scroll.content`
    // so it doesn't scroll with the rows.
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
    g.rect(0, 0, LIST_WIDTH, LIST_VIEWPORT_HEIGHT).stroke({ color: config.outlineColor, width: config.outlineWidth });
    return g;
  }
}
