import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { Team } from "../constants/Team.js";

export interface IGameModel {
  readonly currentTeam: Team;
  readonly gameOver: boolean;
  readonly winner: Team | null;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
