import * as PIXI from "pixi.js";
import {
  ScreenView,
  ButtonComponent,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private _scoreText: PIXI.Text | null = null;
  private _settingsBtn: ButtonComponent | null = null;
  private _goalText: PIXI.Text | null = null;
  private readonly _settingsListeners = new Set<() => void>();
  private _screenWidth = 0;

  public override postInitialize(): void {
    super.postInitialize();

    this._scoreText = new PIXI.Text({
      text: "Score: 0",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 22, fill: 0x000000 }
    });
    this.addChild(this._scoreText);

    this._goalText = new PIXI.Text({
      text: "",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 16, fill: 0x000000 }
    });
    this._goalText.anchor.set(0.5, 0);
    this.addChild(this._goalText);

    // Settings button (top-right gear icon)
    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 20 },
    });
    this._settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 36, height: 36,
      label: "\u2699",
    });
    this.addChild(this._settingsBtn);
    this._settingsBtn.onPress(() => {
      for (const cb of this._settingsListeners) cb();
    });
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._screenWidth = Math.max(1, width);

    // Both widgets hug screen edges, so shift them inward by the safe-area
    // insets (notch / Dynamic Island / home indicator). Zero on devices with no
    // unsafe region, so the desktop layout is unchanged.
    const safe = this.safeAreaInsets;
    if (this._scoreText) {
      // Centred horizontally, still at the top: the board fills the screen, so a score
      // in the dead centre would sit over the gems.
      this._scoreText.anchor.set(0.5, 0);
      this._scoreText.x = this._screenWidth / 2;
      this._scoreText.y = 12 + safe.top;
    }
    if (this._goalText) {
      this._goalText.x = this._screenWidth / 2;
      this._goalText.y = 40 + safe.top;
    }
    if (this._settingsBtn) {
      this._settingsBtn.position.set(this._screenWidth - 52 - safe.right, 12 + safe.top);
    }
  }

  public setScore(score: number): void {
    if (this._scoreText) this._scoreText.text = `Score: ${score}`;
  }

  public setGoal(cleared: number, goal: number): void {
    // Clamped so a cascade overshooting the target does not read as 43/40.
    if (this._goalText) this._goalText.text = `Goal: ${Math.min(cleared, goal)} / ${goal}`;
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._scoreText = null;
    this._goalText = null;
    this._settingsBtn = null;
    super.preDestroy();
  }
}
