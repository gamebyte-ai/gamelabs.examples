import * as PIXI from "pixi.js";
import { PopupView, VerticalLayoutComponent, HorizontalLayoutComponent, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IWinPopupView } from "./IWinPopupView";
import { Team } from "../constants/Team.js";

export class WinPopupView extends PopupView implements IWinPopupView {
  private _panel: VerticalLayoutComponent | null = null;
  private _panelBg: PIXI.Graphics | null = null;
  private _text: PIXI.Text | null = null;
  private _btnBg: PIXI.Graphics | null = null;
  private readonly _playAgainListeners = new Set<() => void>();

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };
  }

  public override postInitialize(): void {
    super.postInitialize();

    const panel = new VerticalLayoutComponent({
      width: 280,
      height: 160,
      justifyContent: "center",
      alignItems: "center",
      gap: 20,
    });

    const panelBg = new PIXI.Graphics();
    panelBg.eventMode = "static";
    panelBg.roundRect(0, 0, 280, 160, 12);
    panelBg.fill({ color: 0x111827, alpha: 0.95 });
    panelBg.stroke({ color: 0x334155, width: 1 });
    panelBg.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    panel.addChild(panelBg);

    // Text (placeholder, set via setResult)
    const text = new PIXI.Text({
      text: "",
      style: { fill: 0xe8eef6, fontSize: 24, fontWeight: "700", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
    });
    text.anchor.set(0.5, 0.5);
    text.layout = {};
    panel.addChild(text);

    // Play Again button
    const btn = new HorizontalLayoutComponent({
      width: 160,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    });
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const btnBg = new PIXI.Graphics();
    btnBg.roundRect(0, 0, 160, 40, 8);
    btnBg.fill({ color: 0x334155 });
    btnBg.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    btn.addChild(btnBg);

    const btnText = new PIXI.Text({
      text: "Play Again",
      style: { fill: 0xe8eef6, fontSize: 16, fontWeight: "600", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
    });
    btnText.anchor.set(0.5, 0.5);
    btnText.layout = {};
    btn.addChild(btnText);

    btn.on("pointertap", () => {
      for (const cb of this._playAgainListeners) cb();
    });

    panel.addChild(btn);

    // Use a wrapper to center the panel within the full-screen popup
    const wrapper = new HorizontalLayoutComponent({
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    });
    wrapper.addChild(panel);
    this.addChild(wrapper);

    this._panel = panel;
    this._panelBg = panelBg;
    this._text = text;
    this._btnBg = btnBg;
  }

  public setResult(winner: Team | null): void {
    if (!this._text) return;
    if (winner === null) {
      this._text.text = "It's a Draw!";
      (this._text.style as any).fill = 0xe8eef6;
    } else if (winner === Team.X) {
      this._text.text = "Player X Wins!";
      (this._text.style as any).fill = 0x60a5fa;
    } else {
      this._text.text = "Player O Wins!";
      (this._text.style as any).fill = 0xef4444;
    }
  }

  public onPlayAgain(cb: () => void): Unsubscribe {
    this._playAgainListeners.add(cb);
    return () => this._playAgainListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._playAgainListeners.clear();
    this._panel = null;
    this._panelBg = null;
    this._text = null;
    this._btnBg = null;
  }
}
