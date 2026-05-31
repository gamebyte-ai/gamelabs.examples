import { InjectionToken } from "@gamebyte/gamelabsjs";

export interface IGameModel {
  readonly score: number;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
