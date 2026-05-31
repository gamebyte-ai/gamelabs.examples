import * as PIXI from "pixi.js";
import {
  DropdownComponent,
  type DropdownComponentStyle,
  OnScreenControlsView,
  ScreenView,
  UIComponentsStyleIds,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import { LEVELS } from "../constants/Levels";

const LEVEL_DROPDOWN_WIDTH = 130;
const LEVEL_DROPDOWN_HEIGHT = 32;
// Pinned just below the OSC settings (gear) button — see
// `BubbleShooterConfig.settingsButtonOffsetY` (16) +
// `settingsButtonSize` (50) + 8 px gap. Keep this value in sync if
// either Config field changes.
const LEVEL_DROPDOWN_TOP = 74;

/**
 * HUD screen for the bubble shooter. Hosts the OnScreenControlsView so
 * label widgets registered on `OnScreenControlManager` (e.g. the score
 * readout in the top-left) actually render, plus a dev-only Level
 * dropdown sitting under the top-right OSC settings button used to
 * switch between hand-crafted test layouts.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _overlay = new PIXI.Graphics();
  private _onScreenControls: OnScreenControlsView | null = null;
  private _levelDropdown: DropdownComponent | null = null;
  private _levelDropdownChangeUnsub: Unsubscribe | null = null;
  private readonly _levelChangeListeners = new Set<(levelId: string) => void>();
  // Latest size from `onResize`, cached so `repositionOnScreenControls`
  // can re-trigger the OSC reposition without a real resize event.
  private _lastWidth = 0;
  private _lastHeight = 0;

  public override postInitialize(): void {
    super.postInitialize();
    this._overlay.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    this.addChild(this._overlay);

    this._onScreenControls = this.viewFactory.createView(OnScreenControlsView);
    this.addChild(this._onScreenControls);

    this._levelDropdown = this._buildLevelDropdown();
    this.addChild(this._levelDropdown);
  }

  public onLevelChanged(cb: (levelId: string) => void): Unsubscribe {
    this._levelChangeListeners.add(cb);
    return () => this._levelChangeListeners.delete(cb);
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._lastWidth = width;
    this._lastHeight = height;
    this.layout = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      flexDirection: "column",
      justifyContent: "flex-start",
      padding: 16,
      gap: 12,
    };
    this._overlay.clear();
    this._overlay.rect(0, 0, Math.max(1, width), Math.max(1, height)).fill({ color: 0x000000, alpha: 0 });
    this._onScreenControls?.resize(width, height);
  }

  public repositionOnScreenControls(): void {
    if (this._lastWidth <= 0 || this._lastHeight <= 0) return;
    this._onScreenControls?.resize(this._lastWidth, this._lastHeight);
  }

  public override preDestroy(): void {
    this._levelDropdownChangeUnsub?.();
    this._levelDropdownChangeUnsub = null;
    this._levelDropdown?.destroy();
    this._levelDropdown = null;
    this._levelChangeListeners.clear();

    this._onScreenControls?.destroy();
    this._onScreenControls = null;
    super.preDestroy();
  }

  private _buildLevelDropdown(): DropdownComponent {
    const style = this.styleManager.resolve<DropdownComponentStyle>(UIComponentsStyleIds.Dropdown);
    const items = LEVELS.map((l) => ({ id: l.id, label: l.label }));
    const dropdown = new DropdownComponent(this.assetLoader, style, {
      width: LEVEL_DROPDOWN_WIDTH,
      height: LEVEL_DROPDOWN_HEIGHT,
      items,
      selectedId: items[0]?.id,
    });
    // Pinned via Yoga absolute layout, sitting just under the OSC
    // settings button so the corner cluster reads as gear-on-top /
    // dropdown-below.
    dropdown.layout = {
      position: "absolute",
      top: LEVEL_DROPDOWN_TOP,
      right: 16,
      width: LEVEL_DROPDOWN_WIDTH,
      height: LEVEL_DROPDOWN_HEIGHT,
    };
    this._levelDropdownChangeUnsub = dropdown.onChange((id) => {
      for (const cb of this._levelChangeListeners) cb(id);
    });
    return dropdown;
  }
}
