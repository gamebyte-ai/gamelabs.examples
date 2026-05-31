import * as PIXI from "pixi.js";
import type { Layout } from "@pixi/layout";
import {
  HudViewBase,
  ButtonComponent,
  HorizontalLayoutComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IDebugBarView } from "./IDebugBarView";

export class DebugBarView extends HudViewBase implements IDebugBarView {
  private static readonly gap = 10;
  private static readonly barPadding = 10;
  private static readonly barButtonHeight = 40;
  private static readonly barButtonWidth = 100;
  private static readonly barRadius = 14;

  private readonly bar = new HorizontalLayoutComponent({
    width: "100%",
    padding: DebugBarView.barPadding,
    gap: DebugBarView.gap,
    justifyContent: "flex-start",
  });

  private readonly barBg = new PIXI.Graphics({
    eventMode: "static",
    layout: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  });

  private gridButton!: ButtonComponent;
  private statsButton!: ButtonComponent;
  private logButton!: ButtonComponent;

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = { width: "100%", padding: 16 };

    const buttonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 13 },
    });
    this.gridButton = new ButtonComponent(this.assetLoader, buttonStyle, {
      width: DebugBarView.barButtonWidth,
      height: DebugBarView.barButtonHeight,
      label: "Grid:Off",
    });
    this.statsButton = new ButtonComponent(this.assetLoader, buttonStyle, {
      width: DebugBarView.barButtonWidth,
      height: DebugBarView.barButtonHeight,
      label: "Stats:Off",
    });
    this.logButton = new ButtonComponent(this.assetLoader, buttonStyle, {
      width: DebugBarView.barButtonWidth,
      height: DebugBarView.barButtonHeight,
      label: "Log:Off",
    });

    this.bar.addChild(this.barBg);
    this.bar.addChild(this.gridButton);
    this.bar.addChild(this.statsButton);
    this.bar.addChild(this.logButton);

    this.bar.on("layout", (l: Layout) => this._handleBarLayout(l));

    this.addChild(this.bar);
    this.setBarVisible(false);
  }

  public setGridLabel(text: string): void {
    this.gridButton.setLabel(text);
  }

  public setStatsLabel(text: string): void {
    this.statsButton.setLabel(text);
  }

  public setLogLabel(text: string): void {
    this.logButton.setLabel(text);
  }

  private _handleBarLayout(l: Layout): void {
    const w = Math.max(1, Math.floor(l.computedLayout.width));
    const h = Math.max(1, Math.floor(l.computedLayout.height));
    this.barBg.clear();
    this.barBg
      .roundRect(0, 0, w, h, DebugBarView.barRadius)
      .fill({ color: 0x0b1220, alpha: 0.9 })
      .stroke({ color: 0x334155, width: 1 });
  }

  public onToggleGroundGrid(cb: () => void): Unsubscribe {
    return this.gridButton.onPress(cb);
  }

  public onToggleStats(cb: () => void): Unsubscribe {
    return this.statsButton.onPress(cb);
  }

  public onToggleLog(cb: () => void): Unsubscribe {
    return this.logButton.onPress(cb);
  }

  public setBarVisible(visible: boolean): void {
    this.bar.visible = visible;
  }

  public resize(_width: number, _height: number): void {
    // Layout handles sizing/positioning.
  }
}
