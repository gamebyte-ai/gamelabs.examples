import { SlotType } from "../constants/SlotType";
import { Pile } from "./Pile";
import { FLUSH_STACK } from "../constants/StackingOffset";
import type { IWastePile } from "./IWastePile";

export class WastePile extends Pile implements IWastePile {
  private _drawCount: number;
  private readonly _fanX: number;

  public constructor(worldX: number, worldZ: number, drawCount: number, fanX: number) {
    super(SlotType.Waste, worldX, worldZ, FLUSH_STACK);
    this._drawCount = drawCount;
    this._fanX = fanX;
  }

  public get drawCount(): number {
    return this._drawCount;
  }

  /**
   * Switch the fan window size at runtime. Used by the Turn 1 /
   * Turn 3 mode toggle — the level restart that accompanies the
   * toggle clears the waste, so no in-flight fan layout needs to
   * be reconciled here.
   */
  public setDrawCount(value: number): void {
    this._drawCount = value;
  }

  public canPlace(): boolean {
    return false;
  }

  public canDragFrom(index: number): boolean {
    if (index !== this._cards.length - 1) return false;
    return this._cards[index]?.faceUp === true;
  }

  /**
   * Top-window fan: the most recent `min(drawCount, length)` cards
   * fan rightward at fixed strides (0, fanX, 2·fanX, ...). Cards
   * older than the visible window stack flush beneath the leftmost
   * fan position. As the top is removed by play, the next-older
   * card automatically becomes part of the visible window — the
   * fan size stays at `drawCount` whenever waste has that many
   * cards in total.
   *
   * Returns flush positions when `drawCount <= 1` (Turn-1 mode) or
   * `fanX === 0`, collapsing the fan to a single stack.
   */
  public override getCardOffset(index: number): { readonly x: number; readonly z: number } {
    if (this._drawCount <= 1 || this._fanX === 0) return { x: 0, z: 0 };
    const fanStartIndex = Math.max(0, this._cards.length - this._drawCount);
    if (index < fanStartIndex) return { x: 0, z: 0 };
    return { x: this._fanX * (index - fanStartIndex), z: 0 };
  }
}
