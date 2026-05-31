import { InjectionToken, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { SliderControlOpts } from "../constants/PlaygroundTypes.js";

/**
 * Demo-facing API for the playground controls panel + event log.
 *
 * Demo controllers resolve {@link IControlsManager} from DI, populate
 * the controls panel via `add*Control(...)` calls, and write status
 * messages via {@link appendLog}. The actual rendering happens inside
 * `PlaygroundShellView`; this manager just forwards the calls so
 * controllers don't have to import any rendering primitives.
 *
 * Each `add*Control(...)` returns an `Unsubscribe` that both detaches
 * the underlying listener and removes the row from the controls panel
 * — pair it with the controller's `UnsubscribeBag` for one-shot cleanup
 * on `destroy()`.
 */
export interface IControlsManager {
  /** Removes every row currently rendered in the controls panel. */
  clear(): void;

  /**
   * Appends a "label slider readout" row. The readout updates live as
   * the slider drags; `onChange` fires on every committed value.
   */
  addSliderControl(
    label: string,
    opts: SliderControlOpts,
    onChange: (value: number) => void,
  ): Unsubscribe;

  /**
   * Appends a "label toggle ON/OFF" row.
   */
  addToggleControl(
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): Unsubscribe;

  /**
   * Appends a "label cycle-button → currentValue" row that round-robins
   * through `values`. Suitable for short two-option toggles where seeing
   * every alternative isn't useful; for sets of three or more options,
   * prefer {@link addDropdownControl} so all alternatives stay visible
   * in the open list.
   */
  addCycleControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;

  /**
   * Appends a "label `DropdownComponent`" row. Renders all values as
   * dropdown items so every alternative is visible in the open list —
   * the canonical control for sets of three or more options.
   */
  addDropdownControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;

  /**
   * Appends a "label `RadioButtonGroup`" row. Renders one radio per
   * value so all options are visible at once — useful for short
   * mutually-exclusive choice sets (e.g. colour palettes) where the
   * cycle-button form would hide the alternatives behind a single tap.
   */
  addRadioGroupControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe;

  /** Appends a "[action button]" row for one-shot commands. */
  addActionControl(label: string, onPress: () => void): Unsubscribe;

  /** Appends one line to the rolling event log (with a timestamp). */
  appendLog(msg: string): void;

  /**
   * Current value of the shell-level "show outline" toggle. Demo
   * controllers read this in `initialize` to seed their view's outline
   * visibility before the first user interaction.
   */
  isOutlineVisible(): boolean;
  /**
   * Subscription for shell-level outline-toggle changes. Demo
   * controllers wire this directly to `view.setOutlineVisible(...)` so
   * the bounds outline persists across demo switches.
   */
  onOutlineChanged(cb: (visible: boolean) => void): Unsubscribe;
}

/**
 * DI token. Bound by `UIPlaygroundApp.configureDI` to a {@link
 * import("./ControlsManager.js").ControlsManager} instance.
 */
export const IControlsManager = new InjectionToken<IControlsManager>("UIPlayground.IControlsManager");
