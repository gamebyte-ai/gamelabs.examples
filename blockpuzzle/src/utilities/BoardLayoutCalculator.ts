import { vector } from "@js-basics/vector";
import { RectGridPreset, type Vector3 } from "@gamebyte/gamelabsjs";
import type { BlockPuzzleConfig } from "../BlockPuzzleConfig";

/**
 * Resolved layout for the current viewport. The grid is
 * *top-anchored*: it sits exactly `config.gridTopMargin` world units
 * below the camera's top edge, regardless of how much room the
 * camera covers below. The tray follows the grid by
 * `config.gridToTraySpacing`. Wider viewports may end up with
 * unused space *below* the tray — that's the trade for the grid
 * staying put visually.
 */
export interface BoardLayout {
  /** World-space position for the playing grid's `GridObject`. */
  readonly gridPosition: Vector3;
  /** World-space position for the tray's `GridObject`. */
  readonly trayPosition: Vector3;
  /** Ortho size sized to fit content + margins under the current
   *  viewport aspect. Drives both `cameraManager.setOrthoSize` and
   *  the HUD's world→screen pixel projection for the combo widget. */
  readonly orthoSize: number;
}

/**
 * Resolves world-space placement for the playing grid and the piece
 * tray, plus the camera ortho size to fit the content + margins.
 *
 * Both surfaces are modeled as `RectGrid`s; the playing grid's preset
 * uses `gridCellSize`, the tray's uses `traySlotSize`. Each preset's
 * `getCenterOffset()` says how far cell (0, 0) sits from the grid's
 * own midpoint, so we cancel that on the grid's position to recentre
 * the cells over the chosen anchor.
 *
 * The grid is top-anchored: the camera top sits at `-orthoSize / 2`
 * in world Z, and the grid's *top edge* is placed `gridTopMargin`
 * below that. The tray follows by `gridToTraySpacing` below the
 * grid's bottom edge. The remaining space below the tray (if any,
 * for tall viewports) is left as visual padding.
 */
export class BoardLayoutCalculator {
  public static compute(config: BlockPuzzleConfig, viewportWidth: number, viewportHeight: number): BoardLayout {
    const gridPreset = BoardLayoutCalculator.makeGridPreset(config);
    const trayPreset = BoardLayoutCalculator.makeTrayPreset(config);

    const gridBounds = gridPreset.getBounds();
    const trayBounds = trayPreset.getBounds();

    // Minimum content height covers top margin → grid → spacing →
    // tray → bottom margin. The camera ortho must be at least this
    // tall; width-driven aspects may push it taller, in which case
    // the extra room goes below the tray.
    const minContentHeight =
      config.gridTopMargin + gridBounds.depth + config.gridToTraySpacing + trayBounds.depth + config.boardMargin;
    const minContentWidth = Math.max(gridBounds.width, trayBounds.width) + 2 * config.boardMargin;

    const aspect = viewportWidth > 0 && viewportHeight > 0 ? viewportWidth / viewportHeight : 1;
    const orthoForHeight = minContentHeight;
    const orthoForWidth = minContentWidth / aspect;
    const orthoSize = Math.max(orthoForHeight, orthoForWidth);

    // World Z grows toward screen-bottom; the camera's top edge is
    // at `-orthoSize / 2` in world coordinates (camera centred at
    // origin per `cameraController.followPosition(0, 0, 0)`).
    const cameraTopZ = -orthoSize / 2;
    const gridTopZ = cameraTopZ + config.gridTopMargin;
    const gridCenterZ = gridTopZ + gridBounds.depth / 2;
    const trayCenterZ = gridCenterZ + gridBounds.depth / 2 + config.gridToTraySpacing + trayBounds.depth / 2;

    const gridOffset = gridPreset.getCenterOffset();
    const trayOffset = trayPreset.getCenterOffset();

    return {
      gridPosition: vector(-gridOffset.x, -gridOffset.y, -gridOffset.z + gridCenterZ),
      trayPosition: vector(-trayOffset.x, -trayOffset.y, -trayOffset.z + trayCenterZ),
      orthoSize,
    };
  }

  public static makeGridPreset(config: BlockPuzzleConfig): RectGridPreset {
    return new RectGridPreset({
      columnCount: config.gridColumns,
      rowCount: config.gridRows,
      columnSize: config.gridCellSize,
      rowSize: config.gridCellSize,
    });
  }

  public static makeTrayPreset(config: BlockPuzzleConfig): RectGridPreset {
    return new RectGridPreset({
      columnCount: config.traySlots,
      rowCount: 1,
      columnSize: config.traySlotSize,
      rowSize: config.traySlotSize,
    });
  }
}
