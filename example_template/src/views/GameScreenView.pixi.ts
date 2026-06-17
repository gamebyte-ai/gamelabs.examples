import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _title = new PIXI.Text({
    text: "",
    style: {
      fill: 0xe8eef6,
      fontSize: 28,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontWeight: "700",
    },
  });

  public override postInitialize(): void {
    super.postInitialize();
    this._title.layout = { alignSelf: "center" };
    this.addChild(this._title);
  }

  public setTitle(title: string): void {
    this._title.text = title;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      flexDirection: "column",
      justifyContent: "flex-start",
      padding: 24,
    };
  }
}
