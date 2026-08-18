import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

/**
 * HUD (2D) view — UI chrome only: the current level label. No game objects and no
 * gameplay input live here (those are in `GameView` on the Content layer); it
 * deliberately does not enable Pixi interactivity, so pointer events fall
 * through to the Content view that owns aiming.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _level = new PIXI.Text({
    text: "",
    style: {
      fill: 0xe8eef6,
      fontSize: 24,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontWeight: "700",
    },
  });

  public override postInitialize(): void {
    super.postInitialize();
    this._level.anchor.set(0, 0); // top-left corner
    this.addChild(this._level);
  }

  public setLevel(level: number): void {
    this._level.text = `Level ${level}`;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._level.position.set(18, 16);
  }
}
