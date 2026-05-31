import type { SlotType } from "../constants/SlotType";
import type { Card, ICard } from "./Card";
import type { StackingOffset } from "../constants/StackingOffset";
import type { IPile } from "./IPile";

/**
 * Abstract base for the four Klondike pile types. Owns the card stack
 * and exposes mutation methods; concrete subclasses define placement /
 * pickup / auto-flip behaviour. Controllers see piles through the
 * read-only {@link IPile} interface; operations consume the concrete
 * class to mutate.
 */
export abstract class Pile implements IPile {
  public readonly type: SlotType;
  public readonly worldX: number;
  public readonly worldZ: number;
  public readonly stackingOffset: StackingOffset;
  protected readonly _cards: Card[] = [];

  protected constructor(type: SlotType, worldX: number, worldZ: number, stackingOffset: StackingOffset) {
    this.type = type;
    this.worldX = worldX;
    this.worldZ = worldZ;
    this.stackingOffset = stackingOffset;
  }

  public get cards(): readonly Card[] {
    return this._cards;
  }

  public get topCard(): Card | null {
    return this._cards.length > 0 ? this._cards[this._cards.length - 1] : null;
  }

  public pushCard(card: Card): void {
    this._cards.push(card);
  }

  public popCard(): Card | null {
    return this._cards.pop() ?? null;
  }

  public clear(): void {
    this._cards.length = 0;
  }

  public abstract canPlace(cards: readonly ICard[]): boolean;
  public abstract canDragFrom(index: number): boolean;

  /**
   * Default: piles never auto-flip. Tableau overrides this to expose
   * its newly-uncovered face-down top after a move.
   */
  public needsAutoFlipNewTop(): boolean {
    return false;
  }

  /**
   * Default linear stacking: card `index` sits at `stackingOffset × index`
   * from the pile's origin. Override for piles whose visual layout is
   * not a single uniform stride.
   */
  public getCardOffset(index: number): { readonly x: number; readonly z: number } {
    return { x: this.stackingOffset.x * index, z: this.stackingOffset.z * index };
  }
}
