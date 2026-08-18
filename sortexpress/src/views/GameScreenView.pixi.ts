import * as PIXI from "pixi.js";
import { ScreenView, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import { SortExpressConfig } from "../SortExpressConfig";

/**
 * Boot HUD screen: a full-bleed gradient backdrop with the centered title and a
 * tap-to-start prompt below it. The whole screen catches the tap and fires
 * {@link onTap}; the game flow is layered on later.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private _config: SortExpressConfig | null = null;
  private _bg: PIXI.Graphics | null = null;
  private _title: PIXI.Text | null = null;
  private _tagline: PIXI.Text | null = null;
  private _w = 0;
  private _h = 0;
  private readonly _tapListeners = new Set<() => void>();

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(SortExpressConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    const cfg = this._config!;

    // Full-screen gradient backdrop that also catches the start tap.
    this._bg = new PIXI.Graphics({ eventMode: "static", cursor: "pointer" });
    this._bg.on("pointertap", () => {
      for (const cb of this._tapListeners) cb();
    });
    this.addChild(this._bg);

    this._title = new PIXI.Text({
      text: cfg.title,
      style: {
        fill: cfg.colors.title,
        fontSize: 64,
        fontWeight: "900",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._title.anchor.set(0.5);
    this.addChild(this._title);

    this._tagline = new PIXI.Text({
      text: cfg.tagline,
      style: {
        fill: cfg.colors.tagline,
        fontSize: 28,
        fontWeight: "600",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._tagline.anchor.set(0.5);
    this.addChild(this._tagline);
  }

  public onTap(cb: () => void): Unsubscribe {
    this._tapListeners.add(cb);
    return () => this._tapListeners.delete(cb);
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = width;
    this._h = height;
    this._relayout();
  }

  private _relayout(): void {
    if (!this._config || this._w === 0 || this._h === 0) return;
    const cfg = this._config;

    // Vertical two-stop gradient backdrop (top → bottom).
    const fill = new PIXI.FillGradient(0, 0, 0, this._h);
    fill.addColorStop(0, cfg.colors.backgroundTop);
    fill.addColorStop(1, cfg.colors.background);
    this._bg?.clear().rect(0, 0, this._w, this._h).fill(fill);

    if (this._title) {
      this._title.style.fontSize = this._h * 0.08;
      this._title.position.set(this._w / 2, this._h * 0.42);
    }
    if (this._tagline) {
      this._tagline.style.fontSize = this._h * cfg.start.fontFraction;
      this._tagline.position.set(this._w / 2, this._h * 0.54);
    }
  }

  public override preDestroy(): void {
    super.preDestroy();
    this._tapListeners.clear();
    this._bg?.destroy();
    this._bg = null;
    this._title?.destroy();
    this._title = null;
    this._tagline?.destroy();
    this._tagline = null;
    this._config = null;
  }
}
