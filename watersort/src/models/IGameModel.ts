import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { Bottle } from "./Bottle.js";

export interface IGameModel {
  readonly bottles: readonly Bottle[];
  readonly level: number;
  readonly moves: number;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
