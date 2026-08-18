import { InjectionToken } from "@gamebyte/gamelabsjs";

export interface IGameModel {
  readonly score: number;
  /** Gems cleared this level, measured against the level's goal. */
  readonly cleared: number;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
