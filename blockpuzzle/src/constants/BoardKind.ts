/**
 * Which board surface a grid represents.
 *
 * The example registers two grids with `GridsModel`: the playing grid
 * and the piece tray. Both are `RectGrid`s — what differs is their
 * dimensions, cell size, and visual treatment. `BoardKind` is the
 * config-side discriminator that the cell view reads to pick the
 * right palette per grid id.
 */
export enum BoardKind {
  Grid = "grid",
  Tray = "tray",
}
