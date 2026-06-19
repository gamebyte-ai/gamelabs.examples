import * as THREE from "three";
import type { PieceCells } from "../../../BlockPuzzleConfig";

export interface BlockAppendOptions {
  /** 0..1 — used by ghost / lifted visuals to read as semi-transparent. */
  readonly opacity?: number;
  /** Local Y the planes sit at. Slightly above the cell surface so
   *  the blocks read on top of the cell paint. */
  readonly y?: number;
}

/**
 * Shared block-layout builder used by:
 *
 * - the item visual (rest state of pieces in tray + grid),
 * - the drag-lifted piece visual (follows the pointer),
 * - the ghost preview visual (snapped to the candidate drop cells).
 *
 * All three render the same per-cell layout — bounding box centred
 * on the host point, blocks at `(col - (bbW - 1) / 2) * size` etc.
 * Centralising the math here makes sure the ghost lines up with
 * where the piece will actually land.
 */
export class PieceMeshBuilder {
  public static readonly DEFAULT_BLOCK_Y = 0.05;
  public static readonly DEFAULT_GHOST_Y = 0.04;
  public static readonly BLOCK_INSET = 0.9;

  /**
   * Append one block mesh per entry in `cells` to `target`, centred
   * on the target's local origin. Each mesh owns its own material so
   * callers can dispose without affecting siblings.
   */
  public static appendBlocks(target: THREE.Object3D, cells: PieceCells, blockSize: number, color: number, opts: BlockAppendOptions = {}): void {
    const { width, height } = PieceMeshBuilder.computeBbox(cells);
    const drawSize = blockSize * PieceMeshBuilder.BLOCK_INSET;
    const y = opts.y ?? PieceMeshBuilder.DEFAULT_BLOCK_Y;
    const opacity = opts.opacity ?? 1;
    const transparent = opacity < 1;
    for (const [col, row] of cells) {
      const x = (col - (width - 1) / 2) * blockSize;
      const z = (row - (height - 1) / 2) * blockSize;
      const geom = new THREE.PlaneGeometry(drawSize, drawSize);
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent, opacity });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      target.add(mesh);
    }
  }

  /** Bounding box (in cells) that contains all of `cells`. */
  public static computeBbox(cells: PieceCells): { readonly width: number; readonly height: number } {
    let maxCol = 0;
    let maxRow = 0;
    for (const [col, row] of cells) {
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
    }
    return { width: maxCol + 1, height: maxRow + 1 };
  }
}
