import type { IScreenView } from "@gamebyte/gamelabsjs";
import type { Team } from "../constants/Team.js";

export interface IGameScreenView extends IScreenView {
  setActiveTeam(team: Team): void;
}
