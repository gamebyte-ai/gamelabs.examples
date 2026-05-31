import * as THREE from "three";
import gsap from "gsap";
import type { GridObject, IInstanceResolver } from "@gamebyte/gamelabsjs";
import { GridsView, type GridCellObject } from "@gamebyte/gamelabsjs";
import { Game2048Config } from "../../../Game2048Config.js";
import type { MovePlan, SpawnResult } from "../../../utilities/GameOperations.js";
import { GameBoardItemObject } from "./GameBoardItemObject.js";
import type { IGameBoardsView } from "./IGameBoardsView.js";

export class GameBoardsView extends GridsView implements IGameBoardsView {
  private _config: Game2048Config | null = null;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(Game2048Config);
  }

  public animateMove(gridId: number, plan: MovePlan): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || !plan.moved || plan.slides.length === 0) return Promise.resolve();
    const dur = cfg.animSlideSec;

    return new Promise((resolve) => {
      let pending = 0;
      const oneDone = (): void => {
        pending--;
        if (pending <= 0) resolve();
      };
      for (const sl of plan.slides) {
        const tile = this._getTile(go, sl.fromCol, sl.fromRow);
        if (!tile) continue;
        const offset = this._localOffsetTowardCell(go, sl.fromCol, sl.fromRow, sl.toCol, sl.toRow);
        pending++;
        gsap.to(tile.position, {
          x: offset.x,
          y: tile.position.y,
          z: offset.z,
          duration: dur,
          ease: "power2.out",
          onComplete: oneDone,
        });
      }
      if (pending === 0) resolve();
    });
  }

  public animateMergePops(gridId: number, plan: MovePlan): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go || plan.merges.length === 0) return Promise.resolve();
    const dur = cfg.animMergePopSec;
    const peak = cfg.animMergePopPeakScale;

    return new Promise((resolve) => {
      let pending = 0;
      const oneDone = (): void => {
        pending--;
        if (pending <= 0) resolve();
      };
      for (const mg of plan.merges) {
        const tile = this._getTile(go, mg.col, mg.row);
        if (!tile) continue;
        pending++;
        const tl = gsap.timeline({
          onComplete: () => {
            tile.scale.set(1, 1, 1);
            oneDone();
          }
        });
        tl.to(tile.scale, { x: peak, y: peak, z: peak, duration: dur * 0.5, ease: "back.out(2)" });
        tl.to(tile.scale, { x: 1, y: 1, z: 1, duration: dur * 0.5, ease: "power2.in" });
      }
      if (pending === 0) resolve();
    });
  }

  public animateSpawn(gridId: number, spawn: SpawnResult): Promise<void> {
    const cfg = this._config;
    const go = this.getGridObject(gridId);
    if (!cfg || !go) return Promise.resolve();
    const tile = this._getTile(go, spawn.col, spawn.row);
    if (!tile) return Promise.resolve();
    tile.scale.set(0.05, 0.05, 0.05);
    return new Promise((resolve) => {
      gsap.to(tile.scale, {
        x: 1, y: 1, z: 1,
        duration: cfg.animSpawnSec,
        ease: "back.out(1.8)",
        onComplete: () => resolve(),
      });
    });
  }

  public override preDestroy(): void {
    this._stopAllTileAnimations();
    super.preDestroy();
  }

  private _stopAllTileAnimations(): void {
    const go = this.getGridObject(Game2048Config.GRID_ID);
    if (!go) return;
    for (let c = 0; c < go.columnCount; c++) {
      for (let r = 0; r < go.rowCount; r++) {
        const item = go.getCell(c, r)?.item;
        if (item instanceof GameBoardItemObject) item.killAnimations();
      }
    }
  }

  private _getTile(go: GridObject, col: number, row: number): GameBoardItemObject | null {
    const item = go.getCell(col, row)?.item;
    return item instanceof GameBoardItemObject ? item : null;
  }

  private _localOffsetTowardCell(go: GridObject, fromCol: number, fromRow: number, toCol: number, toRow: number): THREE.Vector3 {
    const fromCell = go.getCell(fromCol, fromRow) as GridCellObject | undefined;
    const toCell = go.getCell(toCol, toRow) as GridCellObject | undefined;
    if (!fromCell || !toCell) return new THREE.Vector3();
    const w = new THREE.Vector3();
    toCell.getWorldPosition(w);
    return fromCell.worldToLocal(w);
  }
}
