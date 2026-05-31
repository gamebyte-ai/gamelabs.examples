import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  DropdownComponent,
  HorizontalLayoutComponent,
  HudViewBase,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type ButtonComponentStyle,
  type DropdownComponentStyle,
  type DropdownItem,
  type IInstanceResolver,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import { UIPlaygroundAssetIds } from "../UIPlaygroundAssetIds.js";
import { UIPlaygroundConfig } from "../UIPlaygroundConfig.js";
import type { IDropdownDemoView } from "./IDropdownDemoView.js";

const SECTION_LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xa3b1c2,
  fontSize: 12,
  fontWeight: "600",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  letterSpacing: 1,
};

const DEFAULT_HEIGHT = 36;
const TEST_BUTTON_WIDTH = 160;
const TEST_BUTTON_HEIGHT = 36;

/**
 * Live preview for the `DropdownComponent` playground demo. Renders
 * two dropdowns side-by-side:
 *
 *   1. **Default skin** — `DropdownComponent` constructed with the
 *      framework default style resolved from
 *      `UIComponentsStyleIds.Dropdown` (header + list rounded slate
 *      sprites, indigo selected-row, light-slate chevron — the legacy
 *      palette baked into the shipped PNGs).
 *   2. **Custom skin** — `DropdownComponent` constructed with a per-
 *      call style override pointing at the playground's
 *      `UIPlaygroundAssetIds.CustomDropdown*` PNGs (violet / amber).
 *
 * Below the row, a single test button is centred horizontally between
 * the two dropdowns — opening either dropdown's list overlaps the
 * button (left half from the default's list, right half from the
 * custom's), so one fixture covers the overlay z-order check for both.
 *
 * Width / itemHeight / placeholder changes rebuild both dropdowns;
 * `setItems` / programmatic `setSelectedId` / programmatic `toggleList`
 * apply to both. User taps on either dropdown only affect that
 * dropdown's selection — they're not synced.
 */
export class DropdownDemoView extends HudViewBase implements IDropdownDemoView {
  private _config: UIPlaygroundConfig | null = null;

  private _column: VerticalLayoutComponent | null = null;
  private _dropdownsRow: HorizontalLayoutComponent | null = null;
  private _defaultDropdown: DropdownComponent | null = null;
  private _customDropdown: DropdownComponent | null = null;
  private _defaultOutline: PIXI.Graphics | null = null;
  private _customOutline: PIXI.Graphics | null = null;
  private _defaultChangeUnsub: Unsubscribe | null = null;
  private _customChangeUnsub: Unsubscribe | null = null;
  private _testButton: ButtonComponent | null = null;
  private _testButtonUnsub: Unsubscribe | null = null;
  private _outlineVisible = false;
  private readonly _changeListeners = new Set<(which: "default" | "custom", id: string, item: DropdownItem) => void>();
  private readonly _testButtonListeners = new Set<() => void>();

  // Mutable props (apply to both dropdowns).
  private _width = 200;
  private _itemHeight = 32;
  private _placeholder = "Select…";
  private _items: readonly DropdownItem[] = [];
  // Per-skin selection state — user clicks on one dropdown don't sync to
  // the other; only programmatic `setSelectedId` mirrors across both.
  private _defaultSelectedId: string | null = null;
  private _customSelectedId: string | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(UIPlaygroundConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = {};
    // _buildColumn() also wires up _buildTestButton via _rebuildDropdowns,
    // so we don't call the test-button builder separately here.
    this._buildColumn();
  }

  public setWidth(width: number): void {
    if (this._width === width) return;
    this._width = width;
    this._rebuildDropdowns();
  }

  public setItemHeight(height: number): void {
    if (this._itemHeight === height) return;
    this._itemHeight = height;
    this._rebuildDropdowns();
  }

  public setPlaceholder(placeholder: string): void {
    if (this._placeholder === placeholder) return;
    this._placeholder = placeholder;
    this._rebuildDropdowns();
  }

  public setItems(items: readonly DropdownItem[]): void {
    this._items = items;
    this._defaultDropdown?.setItems(items);
    this._customDropdown?.setItems(items);
    // Mirror the component's silent-clear behaviour.
    this._defaultSelectedId = this._defaultDropdown?.selectedId ?? null;
    this._customSelectedId = this._customDropdown?.selectedId ?? null;
  }

  public setSelectedId(id: string | null): void {
    this._defaultSelectedId = id;
    this._customSelectedId = id;
    this._defaultDropdown?.setSelectedId(id);
    this._customDropdown?.setSelectedId(id);
  }

  public toggleList(): void {
    this._defaultDropdown?.toggle();
    this._customDropdown?.toggle();
  }

  public setOutlineVisible(visible: boolean): void {
    this._outlineVisible = visible;
    this._refreshOutlines();
  }

  public onChange(cb: (which: "default" | "custom", id: string, item: DropdownItem) => void): Unsubscribe {
    this._changeListeners.add(cb);
    return () => this._changeListeners.delete(cb);
  }

  public onTestButtonPress(cb: () => void): Unsubscribe {
    this._testButtonListeners.add(cb);
    return () => this._testButtonListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._changeListeners.clear();
    this._testButtonListeners.clear();
    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._testButtonUnsub?.();
    this._testButtonUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    this._column?.removeFromParent();
    this._column?.destroy({ children: true });
    this._column = null;
    this._dropdownsRow = null;
    this._defaultDropdown = null;
    this._customDropdown = null;
    // _testButton is parented inside _column, so destroy({children:true}) above
    // already disposed it — clear the handle to avoid double-destroy.
    this._testButton = null;
    this._config = null;
    super.preDestroy();
  }

  private _fireChange(which: "default" | "custom", id: string, item: DropdownItem): void {
    if (which === "custom") this._customSelectedId = id;
    else this._defaultSelectedId = id;
    for (const cb of this._changeListeners) cb(which, id, item);
  }

  private _fireTestButtonPress(): void {
    for (const cb of this._testButtonListeners) cb();
  }

  private _buildColumn(): void {
    // Outer column: dropdowns row on top, test button below. `alignItems:
    // center` so the button sits horizontally centred under the row
    // regardless of the row's own width.
    const column = new VerticalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "center",
      justifyContent: "flex-start",
    });
    this._column = column;
    this.addChild(column);
    this._rebuildDropdowns();
  }

  private _rebuildDropdowns(): void {
    if (!this._column) return;

    this._defaultChangeUnsub?.();
    this._customChangeUnsub?.();
    this._defaultChangeUnsub = null;
    this._customChangeUnsub = null;
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;

    // Tear down anything currently in the column (the previous dropdowns
    // row and, if it exists, the previously-built test button) so the
    // rebuild starts from a clean slate.
    this._column.removeChildren().forEach((c) => c.destroy({ children: true }));
    // _testButton was parented inside the column; the destroy above
    // already disposed it. Drop the stale handle so we know to rebuild.
    this._testButtonUnsub = null;
    this._testButton = null;
    this._dropdownsRow = null;

    // Row 1: default + custom dropdowns side-by-side.
    const row = new HorizontalLayoutComponent({
      gap: 24,
      padding: 0,
      alignItems: "flex-start",
      justifyContent: "flex-start",
    });
    row.addChild(this._buildSection("DEFAULT SKIN (slate / indigo)", false));
    row.addChild(this._buildSection("CUSTOM SKIN (violet / amber)", true));
    this._dropdownsRow = row;
    this._column.addChild(row);

    // Row 2: single overlay-test button. Centred by the column's
    // `alignItems: "center"` — landing roughly between the two
    // dropdowns so opening either list overlaps part of the button.
    this._buildTestButton();

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
    // each sprite slot with the playground's own asset ids. The label
    // TextStyle stays from the registered defaults since it isn't
    // overridden.
    const dropdownStyle = isCustom
      ? this.styleManager.resolve<DropdownComponentStyle>(UIComponentsStyleIds.Dropdown, {
          header: { textureId: UIPlaygroundAssetIds.CustomDropdownHeader },
          list: { textureId: UIPlaygroundAssetIds.CustomDropdownList },
          itemIdle: { textureId: UIPlaygroundAssetIds.CustomDropdownItemIdle },
          itemHover: { textureId: UIPlaygroundAssetIds.CustomDropdownItemHover },
          itemSelected: { textureId: UIPlaygroundAssetIds.CustomDropdownItemSelected },
          chevron: { textureId: UIPlaygroundAssetIds.CustomDropdownChevron },
        })
      : this.styleManager.resolve<DropdownComponentStyle>(UIComponentsStyleIds.Dropdown);

    const initialSelectedId = isCustom ? this._customSelectedId : this._defaultSelectedId;
    const dropdown = new DropdownComponent(this.assetLoader, dropdownStyle, {
      width: this._width,
      height: DEFAULT_HEIGHT,
      itemHeight: this._itemHeight,
      placeholder: this._placeholder,
      items: this._items,
      selectedId: initialSelectedId ?? undefined,
    });
    // `DropdownComponent` doesn't set its own `.layout`, so Yoga would
    // skip it without an explicit one and the dropdown would render at
    // its own (0, 0) on top of the section caption.
    dropdown.layout = { width: this._width, height: DEFAULT_HEIGHT };

    if (isCustom) {
      this._customDropdown = dropdown;
      this._customChangeUnsub = dropdown.onChange((id, item) => this._fireChange("custom", id, item));
    } else {
      this._defaultDropdown = dropdown;
      this._defaultChangeUnsub = dropdown.onChange((id, item) => this._fireChange("default", id, item));
    }
    section.addChild(dropdown);

    return section;
  }

  private _buildTestButton(): void {
    if (!this._column) return;
    this._testButtonUnsub?.();
    this._testButtonUnsub = null;
    this._testButton?.removeFromParent();
    this._testButton?.destroy();

    // Width / colour / label are fixed constants — this fixture is
    // intentionally untouched by the dropdown's controls so the
    // overlay test isn't disturbed by `setWidth` etc.
    const testButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 13, fontWeight: "700", color: 0xffffff },
    });
    this._testButton = new ButtonComponent(this.assetLoader, testButtonStyle, {
      width: TEST_BUTTON_WIDTH,
      height: TEST_BUTTON_HEIGHT,
      label: "Click me (overlay test)",
    });
    this._testButtonUnsub = this._testButton.onPress(() => this._fireTestButtonPress());
    // Parent into the column so `alignItems: "center"` centres the
    // button under the dropdowns row. Adding directly to `this` would
    // bypass Yoga and the button would render at (0, 0).
    this._column.addChild(this._testButton);
  }

  private _refreshOutlines(): void {
    this._defaultOutline?.removeFromParent();
    this._defaultOutline?.destroy();
    this._defaultOutline = null;
    this._customOutline?.removeFromParent();
    this._customOutline?.destroy();
    this._customOutline = null;
    if (!this._outlineVisible || !this._config) return;

    if (this._defaultDropdown) {
      this._defaultOutline = this._makeOutline();
      this._defaultDropdown.addChild(this._defaultOutline);
    }
    if (this._customDropdown) {
      this._customOutline = this._makeOutline();
      this._customDropdown.addChild(this._customOutline);
    }
  }

  private _makeOutline(): PIXI.Graphics {
    const config = this._config!;
    const g = new PIXI.Graphics();
    g.eventMode = "none";
    g.rect(0, 0, this._width, DEFAULT_HEIGHT).stroke({
      color: config.outlineColor,
      width: config.outlineWidth,
    });
    return g;
  }
}
