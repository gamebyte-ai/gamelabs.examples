import {
  UnsubscribeBag,
  type IInstanceResolver,
  type IViewController,
} from "@gamebyte/gamelabsjs";
import {
  SCROLL_VIEW_DIRECTIONS,
  type ScrollViewDirectionPreset,
} from "../constants/DemoPresets.js";
import { IControlsManager } from "../utilities/IControlsManager.js";
import type { IScrollViewDemoView } from "../views/IScrollViewDemoView.js";

/**
 * Controller for `ScrollViewDemoView`. Drives direction, item count,
 * scrollbar visibility, and wheel speed through the controls panel,
 * plus two programmatic scroll actions. Live `onScroll` events are
 * piped into the shell's event log.
 */
export class ScrollViewDemoViewController implements IViewController<IScrollViewDemoView> {
  private _controls: IControlsManager | null = null;
  private _view: IScrollViewDemoView | null = null;
  private _directionIndex = 0; // default: "vertical"
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._controls = resolver.getInstance(IControlsManager);
  }

  public initialize(view: IScrollViewDemoView): void {
    if (!this._controls) {
      throw new Error("ScrollViewDemoViewController is not initialized");
    }
    this._view = view;
    this._controls.clear();

    view.setOutlineVisible(this._controls.isOutlineVisible());
    this._subs.add(this._controls.onOutlineChanged((visible) => view.setOutlineVisible(visible)));

    this._subs.add(
      this._controls.addDropdownControl(
        "direction",
        SCROLL_VIEW_DIRECTIONS,
        this._directionIndex,
        (direction) => direction,
        (direction, index) => this._onDirectionCycled(direction, index),
      ),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "itemCount",
        { min: 1, max: 100, step: 1, value: 30, format: (v) => `${Math.round(v)}` },
        (v) => this._onItemCountChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addToggleControl("scrollbar", true, (v) => this._onScrollbarToggled(v)),
    );

    this._subs.add(
      this._controls.addSliderControl(
        "wheelSpeed",
        { min: 10, max: 300, step: 10, value: 50, format: (v) => `${Math.round(v)}px` },
        (v) => this._onWheelSpeedChanged(v),
      ),
    );

    this._subs.add(
      this._controls.addActionControl("Scroll to start", () => this._onScrollToStartPressed()),
    );

    this._subs.add(
      this._controls.addActionControl("Scroll to end", () => this._onScrollToEndPressed()),
    );

    this._subs.add(view.onScroll((which, x, y) => this._onLiveScroll(which, x, y)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._controls = null;
  }

  // ── Control handlers ────────────────────────────────────────────────

  private _onDirectionCycled(value: ScrollViewDirectionPreset, index: number): void {
    this._directionIndex = index;
    this._view?.setDirection(value);
    this._controls?.appendLog(`ScrollView → direction=${value}`);
  }

  private _onItemCountChanged(v: number): void {
    const count = Math.round(v);
    this._view?.setItemCount(count);
  }

  private _onScrollbarToggled(visible: boolean): void {
    this._view?.setShowScrollbar(visible);
    this._controls?.appendLog(`ScrollView → showScrollbar=${visible}`);
  }

  private _onWheelSpeedChanged(v: number): void {
    this._view?.setWheelSpeed(Math.round(v));
  }

  private _onScrollToStartPressed(): void {
    this._view?.scrollToStart();
    this._controls?.appendLog("ScrollView → scrollTo(0, 0)");
  }

  private _onScrollToEndPressed(): void {
    this._view?.scrollToEnd();
    this._controls?.appendLog("ScrollView → scrollTo(end)");
  }

  private _onLiveScroll(which: "default" | "custom", x: number, y: number): void {
    // Sparse log: only round positions and skip noisy redundant lines
    // when the offset hasn't crossed an integer pixel boundary.
    this._controls?.appendLog(`ScrollView(${which}) → onScroll x=${Math.round(x)} y=${Math.round(y)}`);
  }
}
