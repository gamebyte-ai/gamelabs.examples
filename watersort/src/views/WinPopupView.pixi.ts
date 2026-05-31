import * as PIXI from "pixi.js";
import {
  PopupView,
  ButtonComponent,
  VerticalLayoutComponent,
  HorizontalLayoutComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IWinPopupView } from "./IWinPopupView";
import { WaterSortAssetIds } from "../WaterSortAssetIds.js";

export class WinPopupView extends PopupView implements IWinPopupView {
  private _titleText: PIXI.Text | null = null;
  private _detailText: PIXI.Text | null = null;
  private _nextBtn: ButtonComponent | null = null;
  private readonly _nextLevelListeners = new Set<() => void>();

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };
  }

  public override postInitialize(): void {
    super.postInitialize();

    const panel = new VerticalLayoutComponent({
      width: 300,
      height: 240,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
    });

    const panelBg = new PIXI.Graphics();
    panelBg.eventMode = "static";
    panelBg.roundRect(0, 0, 300, 240, 20);
    panelBg.fill({ color: 0xffffff, alpha: 0.92 });
    panelBg.stroke({ color: 0xcbd5e0, width: 2 });
    panelBg.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    panel.addChild(panelBg);

    // Star icon
    const starTexture = this.assetLoader.getAsset<PIXI.Texture>(WaterSortAssetIds.Star);
    if (starTexture) {
      const star = new PIXI.Sprite(starTexture);
      star.anchor.set(0.5, 0.5);
      star.width = 48;
      star.height = 48;
      star.layout = {};
      panel.addChild(star);
    }

    this._titleText = new PIXI.Text({
      text: "Sorted!",
      style: { fill: 0x38a169, fontSize: 28, fontWeight: "800", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
    });
    this._titleText.anchor.set(0.5, 0.5);
    this._titleText.layout = {};
    panel.addChild(this._titleText);

    this._detailText = new PIXI.Text({
      text: "",
      style: { fill: 0x718096, fontSize: 16, fontWeight: "600", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
    });
    this._detailText.anchor.set(0.5, 0.5);
    this._detailText.layout = {};
    panel.addChild(this._detailText);

    // Win popup's CTA — green for the "next level" affordance, kept on
    // top of the default skin via tint.
    const nextBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 15, fontWeight: "700", color: 0xffffff },
    });
    this._nextBtn = new ButtonComponent(this.assetLoader, nextBtnStyle, {
      width: 160,
      height: 44,
      label: "Next Level",
    });
    this._nextBtn.tint = 0x48bb78;
    panel.addChild(this._nextBtn);

    this._nextBtn.onPress(() => {
      for (const cb of this._nextLevelListeners) cb();
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

  public setResult(level: number, moves: number): void {
    if (this._detailText) {
      this._detailText.text = `Level ${level} completed in ${moves} move${moves !== 1 ? "s" : ""}`;
    }
  }

  public onNextLevel(cb: () => void): Unsubscribe {
    this._nextLevelListeners.add(cb);
    return () => this._nextLevelListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._nextLevelListeners.clear();
    this._titleText = null;
    this._detailText = null;
    this._nextBtn = null;
  }
}
