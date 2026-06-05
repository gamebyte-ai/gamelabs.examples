import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

/**
 * HUD (2D) view — UI only: cannonball count, hint, and the win/lose banner.
 * No game objects and no gameplay input live here (those are in `GameView`);
 * it deliberately does not enable Pixi interactivity so pointer events fall
 * through to the World view that owns aiming.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _ammoText = this._makeText(22, 0xe8eef6, "700");
  private readonly _hintText = this._makeText(18, 0x9fb0c3, "500");
  private readonly _banner = new PIXI.Container();
  private readonly _bannerBg = new PIXI.Graphics();
  private readonly _bannerText = this._makeText(40, 0xffffff, "800");
  private _bannerCenter = { x: 640, y: 360 };

  public override postInitialize(): void {
    super.postInitialize();
    this._hintText.text = "Drag from the cannonball and flick toward the castle";
    this._banner.visible = false;
    this._bannerText.anchor.set(0.5);
    this._banner.addChild(this._bannerBg, this._bannerText);
    this.addChild(this._ammoText, this._hintText, this._banner);
  }

  public setAmmo(ammoLeft: number): void {
    this._ammoText.text = `Cannonballs: ${ammoLeft}`;
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
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this._ammoText.position.set(20, 18);
    this._hintText.position.set(20, h - 36);
    this._bannerCenter = { x: w / 2, y: h / 2 };
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
    this._banner.position.set(this._bannerCenter.x, this._bannerCenter.y);
  }

  private _makeText(fontSize: number, fill: number, fontWeight: PIXI.TextStyleFontWeight): PIXI.Text {
    return new PIXI.Text({
      text: "",
      style: { fill, fontSize, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", fontWeight },
    });
  }
}
