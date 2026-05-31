import { InjectionToken } from "@gamebyte/gamelabsjs";

export type ActiveEnemy = {
  readonly id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  totalDist: number;
  traveled: number;
};

export interface IGameModel {
  readonly playerX: number;
  readonly playerY: number;
  readonly playerVx: number;
  readonly playerVy: number;
  readonly enemies: readonly ActiveEnemy[];
  readonly gameOver: boolean;
}

export const IGameModel = new InjectionToken<IGameModel>("IGameModel");
