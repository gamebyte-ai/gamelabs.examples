import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { IPile } from "./IPile";
import type { IWastePile } from "./IWastePile";

export interface IBoardModel {
  readonly stock: IPile;
  readonly waste: IWastePile;
  readonly foundations: readonly IPile[];
  readonly tableau: readonly IPile[];
  readonly allPiles: readonly IPile[];
}

export const IBoardModel = new InjectionToken<IBoardModel>("IBoardModel");
