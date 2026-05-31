import type { IInstanceResolver, IInjectionTarget } from "@gamebyte/gamelabsjs";
import { AvoidanceConfig } from "../AvoidanceConfig.js";
import { GameModel } from "../models/GameModel.js";
import type { ActiveEnemy } from "../models/IGameModel.js";
import { GameEvents } from "../events/GameEvents.js";
import type { EnemySpawn } from "./WaveManager.js";
import { WaveManager } from "./WaveManager.js";

type SlowState = "ready" | "active" | "cooldown";

export class GameOperations implements IInjectionTarget {
  private _config: AvoidanceConfig | null = null;
  private _model: GameModel | null = null;
  private _gameEvents: GameEvents | null = null;
  private _waveManager: WaveManager | null = null;
  private _inputDx = 0;
  private _inputDy = 0;
  private _wasAnnouncing = false;
  private _slowState: SlowState = "ready";
  private _slowTimerMs = 0;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(AvoidanceConfig);
    this._model = resolver.getInstance(GameModel);
    this._gameEvents = resolver.getInstance(GameEvents);
    this._waveManager = resolver.getInstance(WaveManager);
  }

  public setInput(dx: number, dy: number): void {
    this._inputDx = dx;
    this._inputDy = dy;
  }

  public startGame(): void {
    const area = this._config!.gameAreaSize;
    this._model!.reset(area / 2, area / 2);
    this._wasAnnouncing = false;
    this._slowState = "ready";
    this._slowTimerMs = 0;
    this._gameEvents?.emitSlowAbilityChanged(true);
    this._gameEvents?.emitSlowAbilityProgressChanged(1);
    this._waveManager!.start();
  }

  /** Total milliseconds the ability is unavailable (active phase + cooldown). */
  private _slowDisabledTotalMs(): number {
    return this._config!.slowAbilityDurationMs + this._config!.slowAbilityCooldownMs;
  }

  /** Milliseconds remaining until the ability returns to ready. 0 when ready. */
  private _slowRemainingMs(): number {
    if (this._slowState === "active") return this._slowTimerMs + this._config!.slowAbilityCooldownMs;
    if (this._slowState === "cooldown") return this._slowTimerMs;
    return 0;
  }

  /**
   * User tapped the slow-time button. Only honoured when the ability is
   * ready; ignored during active slow or cooldown.
   */
  public tryActivateSlow(): void {
    if (this._slowState !== "ready") return;
    this._slowState = "active";
    this._slowTimerMs = this._config!.slowAbilityDurationMs;
    this._gameEvents?.emitSlowAbilityChanged(false);
    this._gameEvents?.emitSlowAbilityProgressChanged(0);
  }

  public restart(): void {
    this.startGame();
  }

  public update(dt: number): void {
    if (!this._model || this._model.gameOver) return;

    // Slow timer ticks in real time so 3s active / 10s cooldown are
    // wall-clock durations regardless of the in-game time scale.
    this._updateSlowState(dt);

    const factor = this._slowState === "active" ? this._config!.slowAbilityFactor : 1;
    const gameDt = dt * factor;

    this._updatePlayer(gameDt);
    this._spawnEnemies(gameDt);
    this._updateEnemies(gameDt);
    this._checkCollisions();
  }

  private _updateSlowState(dt: number): void {
    if (this._slowState === "ready") return;
    this._slowTimerMs -= dt * 1000;
    if (this._slowTimerMs > 0) {
      const t = 1 - this._slowRemainingMs() / this._slowDisabledTotalMs();
      this._gameEvents?.emitSlowAbilityProgressChanged(t);
      return;
    }
    if (this._slowState === "active") {
      this._slowState = "cooldown";
      this._slowTimerMs = this._config!.slowAbilityCooldownMs;
      const t = 1 - this._slowRemainingMs() / this._slowDisabledTotalMs();
      this._gameEvents?.emitSlowAbilityProgressChanged(t);
    } else {
      this._slowState = "ready";
      this._slowTimerMs = 0;
      this._gameEvents?.emitSlowAbilityChanged(true);
      this._gameEvents?.emitSlowAbilityProgressChanged(1);
    }
  }

  private _updatePlayer(dt: number): void {
    const config = this._config!;
    const model = this._model!;
    let dx = this._inputDx;
    let dy = this._inputDy;

    // Cap the magnitude at 1 so digital diagonals don't go faster than
    // straight lines, but preserve sub-1 magnitudes from the analog
    // joystick (so partial tilt gives partial speed).
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }

    const vx = dx * config.playerSpeed;
    const vy = dy * config.playerSpeed;
    let px = model.playerX + vx * dt;
    let py = model.playerY + vy * dt;

    const half = config.playerSize / 2;
    const area = config.gameAreaSize;
    px = Math.max(half, Math.min(area - half, px));
    py = Math.max(half, Math.min(area - half, py));

    model.setPlayerPosition(px, py);
    model.setPlayerVelocity(vx, vy);
  }

  private _spawnEnemies(dt: number): void {
    const isAnnouncing = this._waveManager!.state === "announcing";
    if (this._wasAnnouncing && !isAnnouncing) {
      this._gameEvents?.emitWaveAnnounceEnded();
    }
    this._wasAnnouncing = isAnnouncing;

    const spawn = this._waveManager!.update(dt);
    if (spawn) this._addEnemy(spawn);
  }

  private _addEnemy(spawn: EnemySpawn): void {
    const model = this._model!;
    const id = model.nextEnemyId;
    const dx = spawn.endX - spawn.startX;
    const dy = spawn.endY - spawn.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    model.addEnemy({
      id,
      x: spawn.startX,
      y: spawn.startY,
      dx: dx / dist,
      dy: dy / dist,
      speed: spawn.speed,
      totalDist: dist,
      traveled: 0,
    });
  }

  private _updateEnemies(dt: number): void {
    const model = this._model!;
    const toRemove: number[] = [];

    for (const e of model.mutableEnemies) {
      const step = e.speed * dt;
      e.x += e.dx * step;
      e.y += e.dy * step;
      e.traveled += step;
      if (e.traveled >= e.totalDist) toRemove.push(e.id);
    }

    for (const id of toRemove) {
      model.removeEnemy(id);
    }

    if (model.enemies.length === 0) {
      this._waveManager?.notifyAllEnemiesCleared();
    }
  }

  private _checkCollisions(): void {
    const config = this._config!;
    const model = this._model!;
    const shrink = config.collisionShrink;
    const playerR = (config.playerSize / 2) * shrink;

    for (const e of model.enemies) {
      const enemyR = (config.enemySize / 2) * shrink;
      const dx = model.playerX - e.x;
      const dy = model.playerY - e.y;
      if (Math.sqrt(dx * dx + dy * dy) < playerR + enemyR) {
        model.setGameOver(true);
        // Zero velocity so the propulsion trail stops emitting once the
        // player has stopped — in-flight particles age out naturally.
        model.setPlayerVelocity(0, 0);
        this._waveManager?.stop();
        this._gameEvents?.emitCollision(model.playerX, model.playerY);
        this._gameEvents?.emitGameOver(this._waveManager?.currentWave ?? 0);
        return;
      }
    }
  }
}
