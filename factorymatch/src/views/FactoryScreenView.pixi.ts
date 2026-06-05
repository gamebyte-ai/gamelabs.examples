import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IFactoryScreenView } from "./IFactoryScreenView.js";

/**
 * HUD (2D) view — UI only: score and the win/lose banner. The 3D pile, picking,
 * and the slot rack live in the World view; this stays non-interactive so
 * pointer events fall through to it.
 */
export class FactoryScreenView extends ScreenView implements IFactoryScreenView {
  private readonly _score = this._makeText(24, 0xe8eef6, "800");
  private readonly _hint = this._makeText(18, 0x9fb0c3, "500");
  private readonly _banner = new PIXI.Container();
  private readonly _bannerBg = new PIXI.Graphics();
  private readonly _bannerText = this._makeText(40, 0xffffff, "800");
  private _w = 1;
  private _h = 1;

  public override postInitialize(): void {
    super.postInitialize();
    this._hint.text = "Tap a shape to collect it — line up 3 of a kind to score";
    this._banner.visible = false;
    this._bannerText.anchor.set(0.5);
    this._banner.addChild(this._bannerBg, this._bannerText);
    this.addChild(this._score, this._hint, this._banner);
    this.setScore(0);
  }

  public setScore(score: number): void {
    this._score.text = `Score: ${score}`;
  }

  public showBanner(text: string): void {
    this._bannerText.text = text;
    this._banner.visible = true;
    this._layoutBanner();
  }

  public hideBanner(): void {
    this._banner.visible = false;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = Math.max(1, width);
    this._h = Math.max(1, height);
    this._score.position.set(20, 18);
    this._hint.position.set(20, this._h - 34);
    if (this._banner.visible) this._layoutBanner();
  }

  private _layoutBanner(): void {
    const padX = 48;
    const padY = 28;
    const tw = this._bannerText.width + padX * 2;
    const th = this._bannerText.height + padY * 2;
    this._bannerBg.clear();
    this._bannerBg
      .roundRect(-tw / 2, -th / 2, tw, th, 16)
      .fill({ color: 0x0b0f14, alpha: 0.82 })
      .stroke({ width: 2, color: 0xf2c14e });
    this._banner.position.set(this._w / 2, this._h / 2);
  }

  private _makeText(fontSize: number, fill: number, fontWeight: PIXI.TextStyleFontWeight): PIXI.Text {
    return new PIXI.Text({
      text: "",
      style: { fill, fontSize, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight },
    });
  }
}
