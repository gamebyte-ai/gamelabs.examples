import { GridItemObjectOptions, type RectGridPreset } from "@gamebyte/gamelabsjs";
import { Team } from "../../../constants/Team.js";

export class GameItemObjectOptions extends GridItemObjectOptions {
  public readonly team: Team;

  public constructor(itemId: number, gridPreset: RectGridPreset, team: Team) {
    super(itemId, gridPreset);
    this.team = team;
  }
}
