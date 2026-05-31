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
  private _bestText: PIXI.Text | null = null;
  private _hintText: PIXI.Text | null = null;
  private _gameOverGroup: PIXI.Container | null = null;
  private _settingsBtn: ButtonComponent | null = null;
  private _restartBtn: ButtonComponent | null = null;
  private readonly _settingsListeners = new Set<() => void>();
  private readonly _restartListeners = new Set<() => void>();
  private _screenWidth = 0;
  private _screenHeight = 0;

  public override postInitialize(): void {
    super.postInitialize();

    this._scoreText = new PIXI.Text({
      text: "Score: 0",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 24, fill: 0xf9f6f2, fontWeight: "bold" }
    });
    this.addChild(this._scoreText);

    this._bestText = new PIXI.Text({
      text: "Best: 0",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 18, fill: 0xcbd5e1 }
    });
    this.addChild(this._bestText);

    this._hintText = new PIXI.Text({
      text: "Use arrow keys / WASD or swipe to slide tiles",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 14, fill: 0x94a3b8 }
    });
    this.addChild(this._hintText);

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

    const restartBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 22 },
    });
    this._restartBtn = new ButtonComponent(this.assetLoader, restartBtnStyle, {
      width: 36, height: 36,
      label: "\u21bb",
    });
    this.addChild(this._restartBtn);
    this._restartBtn.onPress(() => {
      for (const cb of this._restartListeners) cb();
    });

    this._gameOverGroup = new PIXI.Container();
    this._gameOverGroup.visible = false;
    const gameOverBg = new PIXI.Graphics();
    gameOverBg.eventMode = "static";
    gameOverBg.rect(0, 0, 320, 120).fill({ color: 0x0f172a, alpha: 0.92 }).stroke({ color: 0xf9f6f2, width: 2 });
    this._gameOverGroup.addChild(gameOverBg);
    const gameOverText = new PIXI.Text({
      text: "Game Over",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 36, fill: 0xf9f6f2, fontWeight: "bold" }
    });
    gameOverText.anchor.set(0.5, 0.5);
    gameOverText.position.set(160, 50);
    this._gameOverGroup.addChild(gameOverText);
    const gameOverHint = new PIXI.Text({
      text: "Press the restart button to play again",
      style: { fontFamily: "system-ui, sans-serif", fontSize: 14, fill: 0xcbd5e1 }
    });
    gameOverHint.anchor.set(0.5, 0.5);
    gameOverHint.position.set(160, 92);
    this._gameOverGroup.addChild(gameOverHint);
    this.addChild(this._gameOverGroup);
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._screenWidth = Math.max(1, width);
    this._screenHeight = Math.max(1, height);
    if (this._scoreText) {
      this._scoreText.x = 16;
      this._scoreText.y = 12;
    }
    if (this._bestText) {
      this._bestText.x = 16;
      this._bestText.y = 44;
    }
    if (this._hintText) {
      this._hintText.x = 16;
      this._hintText.y = this._screenHeight - 28;
    }
    if (this._settingsBtn) {
      this._settingsBtn.position.set(this._screenWidth - 52, 12);
    }
    if (this._restartBtn) {
      this._restartBtn.position.set(this._screenWidth - 96, 12);
    }
    if (this._gameOverGroup) {
      this._gameOverGroup.position.set((this._screenWidth - 320) * 0.5, (this._screenHeight - 120) * 0.5);
    }
  }

  public setScore(score: number): void {
    if (this._scoreText) this._scoreText.text = `Score: ${score}`;
  }

  public setBest(best: number): void {
    if (this._bestText) this._bestText.text = `Best: ${best}`;
  }

  public showGameOver(visible: boolean): void {
    if (this._gameOverGroup) this._gameOverGroup.visible = visible;
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  public onRestartTapped(cb: () => void): Unsubscribe {
    this._restartListeners.add(cb);
    return () => this._restartListeners.delete(cb);
  }

  public override preDestroy(): void {
    this._settingsListeners.clear();
    this._restartListeners.clear();
    this._scoreText = null;
    this._bestText = null;
    this._hintText = null;
    this._gameOverGroup = null;
    this._settingsBtn = null;
    this._restartBtn = null;
    super.preDestroy();
  }
}
