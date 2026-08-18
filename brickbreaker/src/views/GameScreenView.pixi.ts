import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

/**
 * Boot HUD screen: a centered title and a tap-to-start prompt below it. The game
 * flow is layered on later.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _title = new PIXI.Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 64, fontWeight: "900", fontFamily: FONT, align: "center" },
  });
  private readonly _tagline = new PIXI.Text({
    text: "",
    style: { fill: 0xcdd9ef, fontSize: 28, fontWeight: "600", fontFamily: FONT, align: "center" },
  });
  private _w = 0;
  private _h = 0;

  public override postInitialize(): void {
    super.postInitialize();
    this._title.anchor.set(0.5);
    this._tagline.anchor.set(0.5);
    this.addChild(this._title, this._tagline);
  }

  public setText(title: string, tagline: string): void {
    this._title.text = title;
    this._tagline.text = tagline;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = width;
    this._h = height;
    this._title.style.fontSize = height * 0.08;
    this._title.position.set(width / 2, height * 0.44);
    this._tagline.style.fontSize = height * 0.045;
    this._tagline.position.set(width / 2, height * 0.54);
  }
}
