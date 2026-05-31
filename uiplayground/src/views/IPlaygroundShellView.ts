import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { DemoEntry, SliderControlOpts } from "../constants/PlaygroundTypes.js";

/**
 * Shell view contract.
 *
 * The shell owns four regions (sidebar / stage / controls / log) and
 * exposes them through this thin abstraction so the controller and the
 * `ControlsManager` utility never import `PIXI.Container` directly.
 *
 * Demo controllers don't see this interface — they go through
 * `IControlsManager` for the controls + log methods. The shell
 * controller calls `mountDemo(id)` on demo activation; the shell
 * resolves the id to a registered View class internally and creates +
 * attaches the view via `viewFactory.createView()`.
 */
export interface IPlaygroundShellView extends IScreenView {
  // ── Sidebar ────────────────────────────────────────────────────────
  /** Renders the full sidebar item list. Called once on init. */
  setSidebarItems(items: readonly DemoEntry[]): void;
  /** Highlights the active row in the sidebar. */
  setActiveSidebarItem(id: string): void;
  /** Fires when the user picks a demo from the sidebar. */
  onSidebarSelected(cb: (id: string) => void): Unsubscribe;

  // ── Stage (active demo view host) ──────────────────────────────────
  /**
   * Tears down the current demo view (if any) and mounts a fresh
   * instance for the demo id. The new view is created via the
   * framework's `viewFactory`, so its controller is injected and
   * initialized as part of this call.
   */
  mountDemo(id: string): void;
  /** Tears down the active demo view without mounting another. */
  unmountDemo(): void;

  // ── Controls panel (forwarded through `ControlsManager`) ──────────
  clearControls(): void;
  addSliderControl(
    label: string,
    opts: SliderControlOpts,
    onChange: (value: number) => void,
  ): Unsubscribe;
  addToggleControl(
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): Unsubscribe;
  addCycleControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;
  addDropdownControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;
  addRadioGroupControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;
  addActionControl(label: string, onPress: () => void): Unsubscribe;

  // ── Event log ──────────────────────────────────────────────────────
  /** Appends a single timestamped line to the rolling event log. */
  appendLog(msg: string): void;

  // ── Outline (debug) ────────────────────────────────────────────────
  /**
   * Whether the global "show outline" toggle is currently ON. Demo
   * controllers query this on init to seed their view's outline state.
   */
  isOutlineVisible(): boolean;
  /**
   * Fires whenever the global outline toggle changes. Demo controllers
   * subscribe so their view can show/hide its bounds outline live.
   */
  onOutlineChanged(cb: (visible: boolean) => void): Unsubscribe;
}
