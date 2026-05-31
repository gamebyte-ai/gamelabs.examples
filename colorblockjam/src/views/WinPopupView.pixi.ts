import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  HorizontalLayoutComponent,
  PopupView,
  UIComponentsStyleIds,
  VerticalLayoutComponent,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IWinPopupView } from "./IWinPopupView.js";

export class WinPopupView extends PopupView implements IWinPopupView {
  private _titleText: PIXI.Text | null = null;
  private _levelText: PIXI.Text | null = null;
  private _detailText: PIXI.Text | null = null;
  private _advanceBtn: ButtonComponent | null = null;
  private readonly _advanceListeners = new Set<() => void>();

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    // Root layout must be told the viewport size so `width/height: "100%"`
    // on the wrapper resolves correctly — post-@pixi/layout decoupling
    // the PopupView base no longer does this automatically.
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };
  }

  public override postInitialize(): void {
    super.postInitialize();

    const panel = new VerticalLayoutComponent({
      width: 340,
      height: 240,
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
    });

    const panelBg = new PIXI.Graphics();
    panelBg.eventMode = "static";
    panelBg.roundRect(0, 0, 340, 240, 20);
    panelBg.fill({ color: 0x111827, alpha: 0.95 });
    panelBg.stroke({ color: 0x475569, width: 2 });
    panelBg.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    panel.addChild(panelBg);

    this._titleText = new PIXI.Text({
      text: "Level Complete!",
      style: {
        fill: 0x4ade80,
        fontSize: 26,
        fontWeight: "800",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      },
    });
    this._titleText.anchor.set(0.5, 0.5);
    this._titleText.layout = {};
    panel.addChild(this._titleText);

    this._levelText = new PIXI.Text({
      text: "",
      style: {
        fill: 0xe2e8f0,
        fontSize: 16,
        fontWeight: "700",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      },
    });
    this._levelText.anchor.set(0.5, 0.5);
    this._levelText.layout = {};
    panel.addChild(this._levelText);

    this._detailText = new PIXI.Text({
      text: "All blocks cleared. Nice work!",
      style: {
        fill: 0xcbd5e0,
        fontSize: 14,
        fontWeight: "600",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      },
    });
    this._detailText.anchor.set(0.5, 0.5);
    this._detailText.layout = {};
    panel.addChild(this._detailText);

    // CTA — blue tint over the default skin to keep the "next level"
    // affordance feeling primary.
    const advanceBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 15, fontWeight: "700", color: 0xffffff },
    });
    this._advanceBtn = new ButtonComponent(this.assetLoader, advanceBtnStyle, {
      width: 200,
      height: 44,
      label: "Next Level",
    });
    this._advanceBtn.tint = 0x3b82f6;
    panel.addChild(this._advanceBtn);
    this._advanceBtn.onPress(() => {
      for (const cb of this._advanceListeners) cb();
    });

    const wrapper = new HorizontalLayoutComponent({
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    });
    wrapper.addChild(panel);
    this.addChild(wrapper);
  }

  public setLevelInfo(levelNumber: number, totalLevels: number): void {
    if (this._levelText) this._levelText.text = `Level ${levelNumber} of ${totalLevels}`;
  }

  public setIsFinalLevel(isFinal: boolean): void {
    if (this._titleText) this._titleText.text = isFinal ? "All Levels Cleared!" : "Level Complete!";
    if (this._detailText) {
      this._detailText.text = isFinal
        ? "You solved every puzzle. Replay from the start?"
        : "All blocks cleared. Nice work!";
    }
    if (this._advanceBtn) this._advanceBtn.setLabel(isFinal ? "Play Again" : "Next Level");
  }

  public onAdvance(cb: () => void): Unsubscribe {
    this._advanceListeners.add(cb);
    return () => this._advanceListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._advanceListeners.clear();
    this._titleText = null;
    this._levelText = null;
    this._detailText = null;
    this._advanceBtn = null;
    super.preDestroy();
  }
}
