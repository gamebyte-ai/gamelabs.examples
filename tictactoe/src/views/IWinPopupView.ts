import type { IPopupView, Unsubscribe } from "@gamebyte/gamelabsjs";
import type { Team } from "../constants/Team.js";

export interface IWinPopupView extends IPopupView {
  setResult(winner: Team | null): void;
  onPlayAgain(cb: () => void): Unsubscribe;
}
