import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import { Team } from "../constants/Team.js";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private static readonly TEXT_BASE = { fill: 0xe8eef6, fontSize: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" };
  private static readonly TEXT_HIGHLIGHT_X = { fill: 0x60a5fa, fontSize: 20, fontWeight: "600" as const };
  private static readonly TEXT_HIGHLIGHT_O = { fill: 0xef4444, fontSize: 20, fontWeight: "600" as const };

  private readonly _playerX = new PIXI.Text({ text: "Player X", style: { ...GameScreenView.TEXT_BASE } });
  private readonly _playerO = new PIXI.Text({ text: "Player O", style: { ...GameScreenView.TEXT_BASE } });
  private _activeTeam: Team = Team.X;

  public override postInitialize(): void {
    super.postInitialize();

    this._playerX.layout = {};
    this._playerO.layout = {};
    this.addChild(this._playerX);
    this.addChild(this._playerO);
    this._updateHighlight();
  }

  public setActiveTeam(team: Team): void {
    this._activeTeam = team;
    this._updateHighlight();
  }

  private _updateHighlight(): void {
    const baseStyle = { ...GameScreenView.TEXT_BASE };
    const highlightX = { ...GameScreenView.TEXT_BASE, ...GameScreenView.TEXT_HIGHLIGHT_X };
    const highlightO = { ...GameScreenView.TEXT_BASE, ...GameScreenView.TEXT_HIGHLIGHT_O };
    (this._playerX as PIXI.Text).style = this._activeTeam === Team.X ? highlightX as any : baseStyle as any;
    (this._playerO as PIXI.Text).style = this._activeTeam === Team.O ? highlightO as any : baseStyle as any;
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 16,
      alignItems: "flex-start",
    };
  }
}
