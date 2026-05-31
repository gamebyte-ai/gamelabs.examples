import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { BubbleColor } from "../constants/BubbleColor";

export interface IBubbleGrid {
  readonly rowCount: number;
  getColumnCount(row: number): number;
  getColor(row: number, col: number): BubbleColor | null;
  isOccupied(row: number, col: number): boolean;
}

export const IBubbleGrid = new InjectionToken<IBubbleGrid>("IBubbleGrid");
