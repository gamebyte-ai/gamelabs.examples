/**
 * Logical type of a single grid cell.
 *
 * Pure enum — no behaviour. Lives in `constants/` per the "enums and types
 * that contain only constant values" rule.
 */
export enum CellType {
  Ground = 0,
  Path = 1,
  Spawn = 2,
  Base = 3,
  Tower = 4,
}
