import type { IGameModel } from "./IGameModel.js";
import type { Block } from "./Block.js";
import type { Door } from "./Door.js";

/**
 * Owns mutable game state for the level. Writes go through
 * {@link GameOperations}, which is the sole resolver of this class.
 */
export class GameModel implements IGameModel {
  private _blocks: Block[] = [];
  private _doors: Door[] = [];

  public get blocks(): readonly Block[] {
    return this._blocks;
  }

  public get doors(): readonly Door[] {
    return this._doors;
  }

  public get isWon(): boolean {
    if (this._blocks.length === 0) return false;
    for (const block of this._blocks) {
      if (!block.cleared) return false;
    }
    return true;
  }

  public setLevel(blocks: Block[], doors: Door[]): void {
    this._blocks = blocks;
    this._doors = doors;
  }

  public getBlockById(id: number): Block | null {
    for (const block of this._blocks) {
      if (block.id === id) return block;
    }
    return null;
  }
}
