/**
 * A bottle holds a stack of color segments (bottom-first).
 * Each segment is a color index into the config's liquidColors array.
 */
export class Bottle {
  public readonly capacity: number;
  private readonly _segments: number[] = [];

  public constructor(capacity: number) {
    this.capacity = capacity;
  }

  public get segments(): readonly number[] {
    return this._segments;
  }

  public get isEmpty(): boolean {
    return this._segments.length === 0;
  }

  public get isFull(): boolean {
    return this._segments.length >= this.capacity;
  }

  public get topColor(): number | null {
    return this._segments.length > 0 ? this._segments[this._segments.length - 1]! : null;
  }

  /** Count of consecutive same-color segments from the top. */
  public get topGroupCount(): number {
    if (this._segments.length === 0) return 0;
    const top = this.topColor!;
    let count = 0;
    for (let i = this._segments.length - 1; i >= 0; i--) {
      if (this._segments[i] !== top) break;
      count++;
    }
    return count;
  }

  public get isSorted(): boolean {
    if (this._segments.length === 0) return true;
    if (this._segments.length !== this.capacity) return false;
    const c = this._segments[0]!;
    return this._segments.every(s => s === c);
  }

  public push(colorIndex: number): void {
    if (this.isFull) throw new Error("Bottle is full");
    this._segments.push(colorIndex);
  }

  public pop(): number {
    if (this.isEmpty) throw new Error("Bottle is empty");
    return this._segments.pop()!;
  }

  public get freeSpace(): number {
    return this.capacity - this._segments.length;
  }
}
