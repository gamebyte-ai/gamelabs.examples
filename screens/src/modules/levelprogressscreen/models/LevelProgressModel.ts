import type { ILevelProgressScreenModel } from "@gamebyte/gamelabsjs";

export class LevelProgressModel implements ILevelProgressScreenModel {
  public readonly visibleItemCount = 5;
  public readonly currentLevel = 2;
}

