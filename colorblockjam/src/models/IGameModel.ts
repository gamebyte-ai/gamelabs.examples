import { InjectionToken } from "@gamebyte/gamelabsjs";
import type { Block } from "./Block.js";
import type { Door } from "./Door.js";

/**
 * Readonly snapshot of game state used by controllers and views. Mutations
 * go through {@link GameOperations}.
 */
export interface IGameModel {
  readonly blocks: readonly Block[];
  readonly doors: readonly Door[];
  readonly isWon: boolean;
  getBlockById(id: number): Block | null;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
