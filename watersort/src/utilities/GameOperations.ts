import type { IInstanceResolver, IInjectionTarget } from "@gamebyte/gamelabsjs";
import { Bottle } from "../models/Bottle.js";
import { GameModel } from "../models/GameModel.js";
import { WaterSortConfig } from "../WaterSortConfig.js";

export class GameOperations implements IInjectionTarget {
  private _config: WaterSortConfig | null = null;
  private _model: GameModel | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(WaterSortConfig);
    this._model = resolver.getInstance(GameModel);
  }

  public generateLevel(level: number): void {
    if (!this._model || !this._config) return;
    this._model.setLevel(level);
    this._model.setMoves(0);
    const cfg = this._config;
    const colorCount = Math.min(cfg.maxColorCount, cfg.startingColorCount + (level - 1) * cfg.colorCountIncrement);
    const capacity = cfg.segmentsPerBottle;

    const segments: number[] = [];
    for (let c = 0; c < colorCount; c++) {
      for (let s = 0; s < capacity; s++) {
        segments.push(c);
      }
    }

    for (let i = segments.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [segments[i], segments[j]] = [segments[j]!, segments[i]!];
    }

    const bottles: Bottle[] = [];
    for (let b = 0; b < colorCount; b++) {
      const bottle = new Bottle(capacity);
      for (let s = 0; s < capacity; s++) {
        bottle.push(segments[b * capacity + s]!);
      }
      bottles.push(bottle);
    }

    for (let e = 0; e < cfg.emptyBottles; e++) {
      bottles.push(new Bottle(capacity));
    }

    this._model.setBottles(bottles);
  }

  public canPour(fromIdx: number, toIdx: number): boolean {
    if (!this._model) return false;
    if (fromIdx === toIdx) return false;
    const from = this._model.bottles[fromIdx];
    const to = this._model.bottles[toIdx];
    if (!from || !to) return false;
    if (from.isEmpty) return false;
    if (to.isFull) return false;
    if (to.isEmpty) return true;
    return to.topColor === from.topColor;
  }

  public pour(fromIdx: number, toIdx: number): number {
    if (!this._model || !this.canPour(fromIdx, toIdx)) return 0;
    const from = this._model.bottles[fromIdx]!;
    const to = this._model.bottles[toIdx]!;
    let moved = 0;
    const maxMove = Math.min(from.topGroupCount, to.freeSpace);

    for (let i = 0; i < maxMove; i++) {
      to.push(from.pop());
      moved++;
    }

    this._model.incrementMoves();
    return moved;
  }

  public isSolved(): boolean {
    if (!this._model) return false;
    return this._model.bottles.every((b) => b.isSorted || b.isEmpty);
  }
}
