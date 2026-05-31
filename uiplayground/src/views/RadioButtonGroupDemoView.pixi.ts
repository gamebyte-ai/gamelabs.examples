import * as PIXI from "pixi.js";
import {
  HudViewBase,
  RadioButtonGroupComponent,
  UIComponentsStyleIds,
  type IInstanceResolver,
  type RadioButtonComponentStyle,
  type RadioButtonGroupItem,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { RadioGroupDirection } from "../constants/DemoPresets.js";
import type { IRadioButtonGroupDemoView } from "./IRadioButtonGroupDemoView.js";

type GroupLayoutEvent = { computedLayout: { width: number; height: number } };

/**
 * Live preview for the `RadioButtonGroupComponent` playground demo.
 *
 * Direction / spacing / per-button style changes rebuild the underlying
 * group (those are constructor-only). Items + selection flow through
 * to the live instance via `setItems` / `setSelectedId`. The component
 * owns the mutual-exclusion model — tapping a button emits `onChange`,
 * which the view forwards to the controller's event log.
 *
 * Outline: subscribes to the group's own "layout" event so it redraws
 * every time Yoga publishes new bounds — handles both item-count
 * changes (different children → re-layout) and demo re-mounting
 * (initial layout pass after construction). `getLocalBounds()` alone
 * isn't reliable here because the group's children are positioned by
 * Yoga, which only runs on prerender; reading bounds synchronously
 * right after `setItems`/construction returns the buttons stacked at
 * (0, 0) and the outline collapses to a single pixel.
 */
export class RadioButtonGroupDemoView
  extends HudViewBase
  implements IRadioButtonGroupDemoView
{
  private _config: UIPlaygroundConfig | null = null;
  private _group: RadioButtonGroupComponent | null = null;
  private _outline: PIXI.Graphics | null = null;
  private _outlineVisible = false;
  private _changeUnsub: Unsubscribe | null = null;
  private readonly _changeListeners = new Set<
    (id: string, item: RadioButtonGroupItem) => void
  >();

  // Mutable props.
  private _direction: RadioGroupDirection = "column";
  private _spacing = 10;
  private _radius = 9;
  private _items: readonly RadioButtonGroupItem[] = [];
  private _selectedId: string | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    this._rebuildGroup();
  }

  public setItems(items: readonly RadioButtonGroupItem[]): void {
    this._items = items;
    this._group?.setItems(items);
    // Mirror the component's silent-clear behaviour so our local
    // selection stays in sync with the live group.
    this._selectedId = this._group?.selectedId ?? null;
    // `RadioButtonGroupComponent.setItems` rebuilds buttons via
    // `addChild`, which appends them after our outline in the group's
    // children — making the buttons paint on top of the outline. Move
    // the outline back to the end so it stays the topmost child.
    if (this._outline && this._group) {
      this._group.addChild(this._outline);
    }
  }

  public setDirection(direction: RadioGroupDirection): void {
    if (this._direction === direction) return;
    this._direction = direction;
    this._rebuildGroup();
  }

  public setSpacing(spacing: number): void {
    if (this._spacing === spacing) return;
    this._spacing = spacing;
    this._rebuildGroup();
  }

  public setRadius(radius: number): void {
    if (this._radius === radius) return;
    this._radius = radius;
    this._rebuildGroup();
  }

  public setSelectedId(id: string | null): void {
    this._selectedId = id;
    this._group?.setSelectedId(id);
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutline();
  }

  public onChange(cb: (id: string, item: RadioButtonGroupItem) => void): Unsubscribe {
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
    this._group?.removeFromParent();
    this._group?.destroy();
    this._group = null;
    this._config = null;
    super.preDestroy();
  }

  private _fireChange(id: string, item: RadioButtonGroupItem): void {
    this._selectedId = id;
    for (const cb of this._changeListeners) cb(id, item);
  }

  private _rebuildGroup(): void {
    this._changeUnsub?.();
    this._changeUnsub = null;
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    this._group?.removeFromParent();
    this._group?.destroy();

    const groupStyle = this.styleManager.resolve<RadioButtonComponentStyle>(UIComponentsStyleIds.RadioButton);
    this._group = new RadioButtonGroupComponent(this.assetLoader, groupStyle, {
      items: this._items,
      selectedId: this._selectedId ?? undefined,
      direction: this._direction,
      spacing: this._spacing,
      radius: this._radius,
    });
    this._changeUnsub = this._group.onChange((id, item) => this._fireChange(id, item));
    this.addChild(this._group);
    this._refreshOutline();
  }

  private _refreshOutline(): void {
    this._outline?.removeFromParent();
    this._outline?.destroy();
    this._outline = null;
    if (!this._outlineVisible || !this._group || !this._config) return;

    const group = this._group;
    const outline = new PIXI.Graphics();
    outline.eventMode = "none";
    group.addChild(outline);
    this._outline = outline;

    const color = this._config.outlineColor;
    const strokeWidth = this._config.outlineWidth;
    const draw = (l: GroupLayoutEvent): void => {
      const w = Math.max(1, l.computedLayout.width);
      const h = Math.max(1, l.computedLayout.height);
      outline.clear();
      outline.rect(0, 0, w, h).stroke({ color, width: strokeWidth });
    };
    group.on("layout", draw);
    // Draw immediately if the group already has computed bounds —
    // covers the "toggle outline ON after layout has settled" path.
    // For freshly built or just-repopulated groups, the layout event
    // fires on the next prerender and updates the outline then.
    if (group.layout) draw(group.layout as unknown as GroupLayoutEvent);
  }
}
