import * as PIXI from "pixi.js";
import {
  GridLayoutComponent,
  HudViewBase,
  type IInstanceResolver,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import {
  GRID_ITEM_PALETTE,
  type GridAlignItems,
  type GridFlexWrap,
  type GridItemHeightMode,
  type GridJustifyContent,
} from "../constants/DemoPresets.js";
import type { IGridLayoutDemoView } from "./IGridLayoutDemoView.js";

const ITEM_SIZE = 36;
const ITEM_RADIUS = 6;
const GRID_WIDTH = 320;

const ALTERNATING_HEIGHTS = [24, 48] as const;
const ASCENDING_HEIGHTS = [24, 30, 36, 42, 48] as const;
const RANDOM_HEIGHT_MIN = 20;
const RANDOM_HEIGHT_MAX = 52;

type GridLayoutEvent = { computedLayout: { width: number; height: number } };

/**
 * Live preview for the `GridLayoutComponent` playground demo.
 *
 * Renders a fixed-width grid container filled with colored child
 * squares. Every prop change rebuilds the underlying `GridLayoutComponent`
 * (constructor-only options) AND the children list, so the wrap
 * behaviour reflects the current configuration immediately.
 *
 * Centring: handled by the parent stage container.
 *
 * Outline: the grid's height depends on item count + wrap and is only
 * known after Yoga's layout pass, so the outline subscribes to the
 * grid's own "layout" event and redraws against the grid's computed
 * bounds. The outline itself is a plain Pixi child (no `.layout`) so
 * it doesn't get pulled into the flex flow as an extra grid cell.
 */
export class GridLayoutDemoView extends HudViewBase implements IGridLayoutDemoView {
  private _config: UIPlaygroundConfig | null = null;
  private _grid: GridLayoutComponent | null = null;
  private _outline: PIXI.Graphics | null = null;
  private _outlineVisible = false;

  // Mutable props.
  private _gap = 8;
  private _padding = 12;
  private _itemCount = 8;
  private _alignItems: GridAlignItems = "center";
  private _justifyContent: GridJustifyContent = "flex-start";
  private _flexWrap: GridFlexWrap = "wrap";
  private _itemHeightMode: GridItemHeightMode = "uniform";
  // Frozen RNG sequence so `random` mode produces a stable layout for
  // a given (mode, itemCount) — toggling alignItems/etc. shouldn't
  // reshuffle the heights.
  private _randomHeights: readonly number[] = [];

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._rebuildGrid();
  }

  public setGap(gap: number): void {
    if (this._gap === gap) return;
    this._gap = gap;
    this._rebuildGrid();
  }

  public setPadding(padding: number): void {
    if (this._padding === padding) return;
    this._padding = padding;
    this._rebuildGrid();
  }

  public setItemCount(count: number): void {
    if (this._itemCount === count) return;
    this._itemCount = count;
    if (this._itemHeightMode === "random" && this._randomHeights.length < count) {
      this._regenerateRandomHeights();
    }
    this._rebuildGrid();
  }

  public setAlignItems(value: GridAlignItems): void {
    if (this._alignItems === value) return;
    this._alignItems = value;
    this._rebuildGrid();
  }

  public setJustifyContent(value: GridJustifyContent): void {
    if (this._justifyContent === value) return;
    this._justifyContent = value;
    this._rebuildGrid();
  }

  public setFlexWrap(value: GridFlexWrap): void {
    if (this._flexWrap === value) return;
    this._flexWrap = value;
    this._rebuildGrid();
  }

  public setItemHeightMode(mode: GridItemHeightMode): void {
    if (this._itemHeightMode === mode) return;
    this._itemHeightMode = mode;
    if (mode === "random") this._regenerateRandomHeights();
    this._rebuildGrid();
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutline();
  }

  public override preDestroy(): void {
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    this._grid?.removeFromParent();
    this._grid?.destroy({ children: true });
    this._grid = null;
    this._config = null;
    super.preDestroy();
  }

  private _rebuildGrid(): void {
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    this._grid?.removeFromParent();
    this._grid?.destroy({ children: true });

    this._grid = new GridLayoutComponent({
      width: GRID_WIDTH,
      gap: this._gap,
      padding: this._padding,
      alignItems: this._alignItems,
      justifyContent: this._justifyContent,
      flexWrap: this._flexWrap,
    });
    for (let i = 0; i < this._itemCount; i++) {
      this._grid.addChild(this._makeItem(i, this._heightForIndex(i)));
    }
    this.addChild(this._grid);
    this._refreshOutline();
  }

  private _heightForIndex(index: number): number {
    switch (this._itemHeightMode) {
      case "uniform":
        return ITEM_SIZE;
      case "alternating":
        return ALTERNATING_HEIGHTS[index % ALTERNATING_HEIGHTS.length]!;
      case "ascending":
        return ASCENDING_HEIGHTS[index % ASCENDING_HEIGHTS.length]!;
      case "random":
        return this._randomHeights[index] ?? ITEM_SIZE;
    }
  }

  private _regenerateRandomHeights(): void {
    const range = RANDOM_HEIGHT_MAX - RANDOM_HEIGHT_MIN;
    const heights: number[] = [];
    for (let i = 0; i < this._itemCount; i++) {
      heights.push(RANDOM_HEIGHT_MIN + Math.floor(Math.random() * (range + 1)));
    }
    this._randomHeights = heights;
  }

  private _refreshOutline(): void {
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    if (!this._outlineVisible || !this._grid || !this._config) return;

    const grid = this._grid;
    const outline = new PIXI.Graphics();
    outline.eventMode = "none";
    // No `.layout` — keeping the outline out of yoga avoids it being
    // sized as an extra absolute child of an auto-height parent (which
    // doesn't reliably emit "layout" on the child node) and lets the
    // grid's own "layout" event drive every redraw.
    grid.addChild(outline);
    this._outline = outline;

    const color = this._config.outlineColor;
    const strokeWidth = this._config.outlineWidth;
    const draw = (l: GridLayoutEvent): void => {
      const w = Math.max(1, l.computedLayout.width);
      const h = Math.max(1, l.computedLayout.height);
      outline.clear();
      outline.rect(0, 0, w, h).stroke({ color, width: strokeWidth });
    };
    grid.on("layout", draw);
    // Draw immediately if the grid already has computed bounds, so
    // toggling outline ON after layout has settled doesn't wait for
    // the next yoga pass to make the outline visible.
    if (grid.layout) draw(grid.layout as unknown as GridLayoutEvent);
  }

  private _makeItem(index: number, height: number): PIXI.Container {
    const item = new PIXI.Container();
    item.layout = { width: ITEM_SIZE, height };

    const fill = new PIXI.Graphics();
    fill.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    fill.roundRect(0, 0, ITEM_SIZE, height, ITEM_RADIUS);
    fill.fill({ color: GRID_ITEM_PALETTE[index % GRID_ITEM_PALETTE.length]! });
    item.addChild(fill);

    return item;
  }
}
