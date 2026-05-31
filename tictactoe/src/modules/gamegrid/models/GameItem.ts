import { GridItem } from "@gamebyte/gamelabsjs";
import { Team } from "../../../constants/Team.js";

export { Team };

export class GameItem extends GridItem {
  public readonly team: Team;

  public constructor(itemId: number, team: Team) {
    super(itemId);
    this.team = team;
  }
}
