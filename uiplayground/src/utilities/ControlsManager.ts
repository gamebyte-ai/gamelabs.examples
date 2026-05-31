import type { Unsubscribe } from "@gamebyte/gamelabsjs";
import type { SliderControlOpts } from "../constants/PlaygroundTypes.js";
import type { IPlaygroundShellView } from "../views/IPlaygroundShellView.js";
import type { IControlsManager } from "./IControlsManager.js";

const NOOP_UNSUBSCRIBE: Unsubscribe = () => {};

/**
 * State manager that mediates between demo controllers and the live
 * shell view's controls + log regions.
 *
 * Lives in `utilities/` per AGENTS.md §Where logic lives ("State
 * managers — utilities/, suffix `*Manager`. Own mutable state for a
 * subsystem and coordinate it across controllers"). The mutable state
 * here is the `_shell` reference set by the shell controller on
 * `bindShell` / cleared on `unbindShell`.
 *
 * Demos resolve this through {@link IControlsManager}, which exposes
 * only the demo-facing methods (no `bindShell` / `unbindShell`).
 */
export class ControlsManager implements IControlsManager {
  private _shell: IPlaygroundShellView | null = null;

  /** Called by the shell view controller once the shell view is live. */
  public bindShell(shell: IPlaygroundShellView): void {
    this._shell = shell;
  }

  /** Called by the shell view controller during teardown. */
  public unbindShell(): void {
    this._shell = null;
  }

  public clear(): void {
    this._shell?.clearControls();
  }

  public addSliderControl(
    label: string,
    opts: SliderControlOpts,
    onChange: (value: number) => void,
  ): Unsubscribe {
    return this._shell?.addSliderControl(label, opts, onChange) ?? NOOP_UNSUBSCRIBE;
  }

  public addToggleControl(
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): Unsubscribe {
    return this._shell?.addToggleControl(label, initial, onChange) ?? NOOP_UNSUBSCRIBE;
  }

  public addCycleControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    return (
      this._shell?.addCycleControl(label, values, initialIndex, formatValue, onChange) ??
      NOOP_UNSUBSCRIBE
    );
  }

  public addDropdownControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    return (
      this._shell?.addDropdownControl(label, values, initialIndex, formatValue, onChange) ??
      NOOP_UNSUBSCRIBE
    );
  }

  public addRadioGroupControl<T>(
    label: string,
    values: readonly T[],
    initialIndex: number,
    formatValue: (value: T) => string,
    onChange: (value: T, index: number) => void,
  ): Unsubscribe {
    return (
      this._shell?.addRadioGroupControl(label, values, initialIndex, formatValue, onChange) ??
      NOOP_UNSUBSCRIBE
    );
  }

  public addActionControl(label: string, onPress: () => void): Unsubscribe {
    return this._shell?.addActionControl(label, onPress) ?? NOOP_UNSUBSCRIBE;
  }

  public appendLog(msg: string): void {
    this._shell?.appendLog(msg);
  }

  public isOutlineVisible(): boolean {
    return this._shell?.isOutlineVisible() ?? false;
  }

  public onOutlineChanged(cb: (visible: boolean) => void): Unsubscribe {
    return this._shell?.onOutlineChanged(cb) ?? NOOP_UNSUBSCRIBE;
  }
}
