import { InjectionToken } from "@gamebyte/gamelabsjs";

export interface IGameModel {
  readonly score: number;
  readonly best: number;
  readonly highestValue: number;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
