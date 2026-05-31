import { Team } from "../constants/Team.js";
import type { IGameModel } from "./IGameModel.js";

/**
 * Holds the current game state: whose turn it is, whether the game
 * is over, and who won. Read access through {@link IGameModel}.
 */
export class GameModel implements IGameModel {
  private _currentTeam: Team = Team.X;
  private _gameOver = false;
  private _winner: Team | null = null;

  public get currentTeam(): Team {
    return this._currentTeam;
  }

  public get gameOver(): boolean {
    return this._gameOver;
  }

  public get winner(): Team | null {
    return this._winner;
  }

  public setCurrentTeam(team: Team): void {
    this._currentTeam = team;
  }

  public setGameOver(value: boolean): void {
    this._gameOver = value;
  }

  public setWinner(winner: Team | null): void {
    this._winner = winner;
  }

  public reset(): void {
    this._currentTeam = Team.X;
    this._gameOver = false;
    this._winner = null;
  }
}
