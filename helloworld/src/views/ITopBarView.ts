import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface ITopBarView extends IView {
  onToggleColor(cb: () => void): Unsubscribe;
  onToggleRotation(cb: () => void): Unsubscribe;
  onToggleDebug(cb: () => void): Unsubscribe;
  resize(width: number, height: number): void;
}

