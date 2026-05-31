import * as PIXI from "pixi.js";
import {
  ButtonComponent,
  ScreenView,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView.js";
import { TowerTypeId, TOWER_TYPES } from "../constants/TowerTypeDef.js";

/**
 * HUD for the tower defense game.
 *
 * - Top bar: "Generate Level" button + gold display.
 * - Bottom bar: tower shop cards showing name, cost, and greying out
 *   when the player cannot afford them.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private static readonly BTN_W = 150;
  private static readonly BTN_H = 36;
  private static readonly SHOP_CARD_W = 140;
  private static readonly SHOP_CARD_H = 52;

  private readonly overlay = new PIXI.Graphics();
  private _generateHandler: (() => void) | null = null;
  private _buyHandler: ((type: TowerTypeId) => void) | null = null;
  private _goldText: PIXI.Text | null = null;
  private _statsText: PIXI.Text | null = null;
  private readonly _towerCards: { card: ButtonComponent; cost: number }[] = [];
  private readonly _settingsListeners = new Set<() => void>();

  public override postInitialize(): void {
    super.postInitialize();

    this.overlay.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    this.overlay.eventMode = "none";
    if (!this.overlay.parent) this.addChild(this.overlay);

    this._createTopBar();
    this._createTowerShop();
  }

  public setGenerateLevelHandler(handler: (() => void) | null): void {
    this._generateHandler = handler;
  }

  public setBuyTowerHandler(handler: ((type: TowerTypeId) => void) | null): void {
    this._buyHandler = handler;
  }

  public updateGold(amount: number): void {
    if (this._goldText) this._goldText.text = `Gold: ${amount}`;
  }

  public updateStats(kills: number, waveNumber: number): void {
    if (this._statsText) this._statsText.text = `Kills: ${kills}  Wave: ${waveNumber}`;
  }

  public updateTowerAffordability(currentGold: number): void {
    for (const entry of this._towerCards) {
      const canAfford = currentGold >= entry.cost;
      entry.card.alpha = canAfford ? 1 : 0.4;
      entry.card.eventMode = canAfford ? "static" : "none";
    }
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    // Root layout must track viewport size so the top bar + tower shop
    // actually flex across the screen; the PopupView/ScreenView bases no
    // longer set this automatically after the @pixi/layout decoupling.
    this.layout = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 12,
      gap: 8,
    };
    this.overlay.clear();
    this.overlay.rect(0, 0, Math.max(1, width), Math.max(1, height)).fill({ color: 0x000000, alpha: 0 });
  }

  public override preDestroy(): void {
    this._generateHandler = null;
    this._buyHandler = null;
    this._towerCards.length = 0;
    this._settingsListeners.clear();
    super.preDestroy();
  }

  // ── Top bar ───────────────────────────────────────────────────────────

  private _createTopBar(): void {
    const row = new PIXI.Container();
    row.layout = { flexDirection: "row", gap: 16, alignItems: "center" };

    const generateBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 14, fontWeight: "600", color: 0xffffff },
    });
    const generateBtn = new ButtonComponent(this.assetLoader, generateBtnStyle, {
      width: GameScreenView.BTN_W,
      height: GameScreenView.BTN_H,
      label: "Generate Level",
    });
    generateBtn.onPress(() => this._generateHandler?.());
    row.addChild(generateBtn);

    this._goldText = new PIXI.Text({
      text: "Gold: 0",
      style: { fontSize: 16, fontFamily: "Arial, sans-serif", fill: 0xffdd44, fontWeight: "bold" },
    });
    this._goldText.layout = { height: GameScreenView.BTN_H };
    row.addChild(this._goldText);

    this._statsText = new PIXI.Text({
      text: "Kills: 0  Wave: 1",
      style: { fontSize: 14, fontFamily: "Arial, sans-serif", fill: 0xccddee, fontWeight: "600" },
    });
    this._statsText.layout = { height: GameScreenView.BTN_H };
    row.addChild(this._statsText);

    // Settings gear button
    const settingsBtnStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: 20, color: 0xcbd5e0 },
    });
    const settingsBtn = new ButtonComponent(this.assetLoader, settingsBtnStyle, {
      width: 36,
      height: 36,
      label: "\u2699",
    });
    settingsBtn.onPress(() => {
      for (const cb of this._settingsListeners) cb();
    });
    row.addChild(settingsBtn);

    this.addChild(row);
  }

  public onSettingsTapped(cb: () => void): Unsubscribe {
    this._settingsListeners.add(cb);
    return () => this._settingsListeners.delete(cb);
  }

  // ── Tower shop ────────────────────────────────────────────────────────

  private _createTowerShop(): void {
    const bar = new PIXI.Container();
    bar.layout = { flexDirection: "row", justifyContent: "center", gap: 12 };

    for (const [typeId, typeDef] of TOWER_TYPES) {
      const card = this._makeTowerCard(typeId, typeDef.name, typeDef.cost, typeDef.color);
      this._towerCards.push({ card, cost: typeDef.cost });
      bar.addChild(card);
    }

    this.addChild(bar);
  }

  private _makeTowerCard(typeId: TowerTypeId, name: string, cost: number, color: number): ButtonComponent {
    const { SHOP_CARD_W, SHOP_CARD_H } = GameScreenView;

    // Each tower type carries its own color identity, so tint the default
    // skin per-card to preserve the visual distinction between tower types.
    const cardStyle = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button);
    const card = new ButtonComponent(this.assetLoader, cardStyle, {
      width: SHOP_CARD_W,
      height: SHOP_CARD_H,
    });
    card.tint = color;

    const nameText = new PIXI.Text({
      text: name,
      style: { fontSize: 14, fontFamily: "Arial, sans-serif", fill: 0xffffff, fontWeight: "bold" },
    });
    nameText.anchor.set(0.5, 0);
    nameText.position.set(SHOP_CARD_W / 2, 6);
    card.addChild(nameText);

    const costText = new PIXI.Text({
      text: `${cost}g`,
      style: { fontSize: 12, fontFamily: "Arial, sans-serif", fill: 0xffdd44 },
    });
    costText.anchor.set(0.5, 0);
    costText.position.set(SHOP_CARD_W / 2, 28);
    card.addChild(costText);

    card.onPress(() => this._buyHandler?.(typeId));

    return card;
  }
}
