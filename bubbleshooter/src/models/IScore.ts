import { InjectionToken } from "@gamebyte/gamelabsjs";

export interface IScore {
  readonly value: number;
}

export const IScore = new InjectionToken<IScore>("IScore");
