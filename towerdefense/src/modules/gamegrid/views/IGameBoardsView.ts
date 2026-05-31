import type { IGridView } from "@gamebyte/gamelabsjs";
import type { TowerTypeId } from "../../../constants/TowerTypeDef.js";

export interface IGameBoardsView extends IGridView {
  setCellPointerDownHandler(handler: ((gridId: number, col: number, row: number) => void) | null): void;
  setCellHoverHandler(handler: ((col: number, row: number, hovered: boolean) => void) | null): void;
  refreshAllCells(): void;
  showGhost(towerType: TowerTypeId): void;
  updateGhostPosition(col: number, row: number, valid: boolean): void;
  hideGhost(): void;
  removeGhost(): void;
  showRangeIndicator(col: number, row: number, range: number, color: number): void;
  hideRangeIndicator(): void;
  /** Rotate cannon turret to face target + barrel recoil kick. */
  animateCannonFire(col: number, row: number, targetX: number, targetZ: number): void;
  /** Stop every pending barrel-recoil tween (called on level teardown). */
  killCannonTweens(): void;
}
