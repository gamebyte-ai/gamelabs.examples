import type { DoorSide } from "../constants/BoardTypes.js";

/**
 * A colored exit on a grid edge. A block can clear through the door only
 * when its perpendicular cell span matches the door exactly and its
 * color matches.
 */
export class Door {
  public readonly id: number;
  public readonly side: DoorSide;
  public readonly spanStart: number;
  public readonly spanEnd: number;
  public readonly colorIndex: number;

  public constructor(id: number, side: DoorSide, spanStart: number, spanEnd: number, colorIndex: number) {
    this.id = id;
    this.side = side;
    this.spanStart = spanStart;
    this.spanEnd = spanEnd;
    this.colorIndex = colorIndex;
  }

  public get spanLength(): number {
    return this.spanEnd - this.spanStart + 1;
  }
}
