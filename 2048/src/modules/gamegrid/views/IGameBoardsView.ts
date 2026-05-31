import type { IGridView } from "@gamebyte/gamelabsjs";
import type { MovePlan, SpawnResult } from "../../../utilities/GameOperations.js";

export interface IGameBoardsView extends IGridView {
  animateMove(gridId: number, plan: MovePlan): Promise<void>;
  animateMergePops(gridId: number, plan: MovePlan): Promise<void>;
  animateSpawn(gridId: number, spawn: SpawnResult): Promise<void>;
}
