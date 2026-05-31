import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface ISliderDemoView extends IView {
  setTrackWidth(trackWidth: number): void;
  setRange(min: number, max: number): void;
  setStepped(stepped: boolean): void;
  /** Force the slider's value programmatically (for the "Reset" action). */
  setValue(value: number): void;
  /** Toggles the debug outline drawn around the live component's bounds. */
  setOutlineVisible(visible: boolean): void;
  /** Fires whenever the user drags the live slider. */
  onChange(cb: (value: number) => void): Unsubscribe;
}
