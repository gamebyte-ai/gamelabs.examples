import type { IScreenView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Bottle } from "../models/Bottle.js";

export interface IGameScreenView extends IScreenView {
  renderBottles(bottles: readonly Bottle[], colors: readonly number[]): void;
  animateSelect(index: number): Promise<void>;
  animateDeselect(index: number): Promise<void>;
  animatePour(fromIdx: number, toIdx: number, segmentCount: number, colorIdx: number): Promise<void>;
  setLevel(level: number): void;
  setMoves(moves: number): void;
  onBottleTapped(cb: (index: number) => void): Unsubscribe;
  onRestartTapped(cb: () => void): Unsubscribe;
}
