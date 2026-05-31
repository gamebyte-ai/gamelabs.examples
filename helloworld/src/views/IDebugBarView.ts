import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

export interface IDebugBarView extends IView {
  onToggleGroundGrid(cb: () => void): Unsubscribe;
  onToggleStats(cb: () => void): Unsubscribe;
  onToggleLog(cb: () => void): Unsubscribe;
  setBarVisible(visible: boolean): void;
  setGridLabel(text: string): void;
  setStatsLabel(text: string): void;
  setLogLabel(text: string): void;
  resize(width: number, height: number): void;
}

