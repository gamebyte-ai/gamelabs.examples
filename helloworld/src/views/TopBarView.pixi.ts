import * as PIXI from "pixi.js";
import type { Layout } from "@pixi/layout";
import {
  HudViewBase,
  ButtonComponent,
  VerticalLayoutComponent,
  HorizontalLayoutComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { ITopBarView } from "./ITopBarView";

export class TopBarView extends HudViewBase implements ITopBarView {
  private static readonly gap = 10;
  private static readonly buttonHeight = 44;
  private static readonly barPadding = 10;
  private static readonly barRadius = 14;

  private readonly bar = new VerticalLayoutComponent({
    width: "100%",
    padding: TopBarView.barPadding,
    gap: TopBarView.gap,
    alignItems: "stretch",
  });

  private readonly barBg = new PIXI.Graphics({
    eventMode: "static",
    layout: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  });

  private readonly title = new PIXI.Text({
    text: "Example 01",
    style: {
      fill: 0xe8eef6,
      fontSize: 14,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontWeight: "600"
    }
  });

  private readonly buttonsRow = new HorizontalLayoutComponent({
    width: "100%",
    gap: TopBarView.gap,
    justifyContent: "flex-start",
  });

  private toggleColorButton!: ButtonComponent;
  private toggleRotationButton!: ButtonComponent;
  private debugButton!: ButtonComponent;

  public override postInitialize(): void {
    super.postInitialize();
    this.layout = { width: "100%", padding: 16 };

    const labelButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 14, fontWeight: "400" },
    });
    const debugButtonStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 14 },
    });
    this.toggleColorButton = new ButtonComponent(this.assetLoader, labelButtonStyle, {
      width: 200,
      height: TopBarView.buttonHeight,
      label: "Toggle cube color",
    });
    this.toggleRotationButton = new ButtonComponent(this.assetLoader, labelButtonStyle, {
      width: 200,
      height: TopBarView.buttonHeight,
      label: "Toggle cube rotation",
    });
    this.debugButton = new ButtonComponent(this.assetLoader, debugButtonStyle, {
      width: 100,
      height: TopBarView.buttonHeight,
      label: "Debug",
    });

    this.bar.addChild(this.barBg);

    this.title.layout = { alignSelf: "center" };
    this.bar.addChild(this.title);

    this.buttonsRow.addChild(this.toggleColorButton);
    this.buttonsRow.addChild(this.toggleRotationButton);
    this.buttonsRow.addChild(this.debugButton);
    this.bar.addChild(this.buttonsRow);

    this.bar.on("layout", (l: Layout) => this._handleBarLayout(l));

    this.addChild(this.bar);
  }

  private _handleBarLayout(l: Layout): void {
    const w = Math.max(1, Math.floor(l.computedLayout.width));
    const h = Math.max(1, Math.floor(l.computedLayout.height));
    this.barBg.clear();
    this.barBg
      .roundRect(0, 0, w, h, TopBarView.barRadius)
      .fill({ color: 0x0b1220, alpha: 0.9 })
      .stroke({ color: 0x334155, width: 1 });
  }

  public onToggleColor(cb: () => void): Unsubscribe {
    return this.toggleColorButton.onPress(cb);
  }

  public onToggleRotation(cb: () => void): Unsubscribe {
    return this.toggleRotationButton.onPress(cb);
  }

  public onToggleDebug(cb: () => void): Unsubscribe {
    return this.debugButton.onPress(cb);
  }

  public resize(_width: number, _height: number): void {
    // Layout handles sizing/positioning.
  }
}
