import type { IInstanceResolver, IInjectionTarget } from "@gamebyte/gamelabsjs";
import { AvoidanceConfig } from "../AvoidanceConfig.js";
import { GameEvents } from "../events/GameEvents.js";

export type EnemySpawn = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  speed: number;
};

export class WaveManager implements IInjectionTarget {
  private _config: AvoidanceConfig | null = null;
  private _events: GameEvents | null = null;
  private _currentWave = 0;
  private _enemiesSpawned = 0;
  private _enemiesForWave = 0;
  private _spawnTimer = 0;
  private _announceTimer = 0;
  private _pauseTimer = 0;
  private _state: "idle" | "announcing" | "spawning" | "waiting" | "done" = "idle";
  private _gameOver = false;

  public inject(resolver: IInstanceResolver): void {
    this._config = resolver.getInstance(AvoidanceConfig);
    this._events = resolver.getInstance(GameEvents);
  }

  public get currentWave(): number {
    return this._currentWave;
  }

  public get state(): string {
    return this._state;
  }

  public start(): void {
    this._currentWave = 0;
    this._gameOver = false;
    this._startNextWave();
  }

  public stop(): void {
    this._gameOver = true;
    this._state = "done";
  }

  public update(dt: number): EnemySpawn | null {
    if (this._gameOver || this._state === "done" || this._state === "idle") return null;

    if (this._state === "announcing") {
      this._announceTimer -= dt * 1000;
      if (this._announceTimer <= 0) {
        this._state = "spawning";
        this._spawnTimer = 0;
      }
      return null;
    }

    if (this._state === "waiting") {
      this._pauseTimer -= dt * 1000;
      if (this._pauseTimer <= 0) {
        this._startNextWave();
      }
      return null;
    }

    if (this._state === "spawning") {
      this._spawnTimer -= dt * 1000;
      if (this._spawnTimer <= 0 && this._enemiesSpawned < this._enemiesForWave) {
        this._enemiesSpawned++;
        const spawnDelay = Math.max(
          this._config!.waveMinSpawnDelayMs,
          this._config!.waveBaseSpawnDelayMs - (this._currentWave - 1) * this._config!.waveSpawnDelayDecrementMs,
        );
        this._spawnTimer = spawnDelay;
        return this._generateSpawn();
      }
    }

    return null;
  }

  public notifyAllEnemiesCleared(): void {
    if (this._state === "spawning" && this._enemiesSpawned >= this._enemiesForWave) {
      this._state = "waiting";
      this._pauseTimer = this._config!.wavePauseBetweenMs;
    }
  }

  public restart(): void {
    this._gameOver = false;
    this._state = "idle";
    this._currentWave = 0;
    this.start();
  }

  private _startNextWave(): void {
    this._currentWave++;
    this._enemiesSpawned = 0;
    this._enemiesForWave =
      this._config!.waveBaseEnemyCount + (this._currentWave - 1) * this._config!.waveEnemyCountIncrement;
    this._announceTimer = this._config!.waveAnnounceDurationMs;
    this._state = "announcing";
    this._events!.emitWaveStarted(this._currentWave);
  }

  private _generateSpawn(): EnemySpawn {
    const area = this._config!.gameAreaSize;
    const margin = 60;
    const speed = this._config!.enemyBaseSpeed + (this._currentWave - 1) * this._config!.enemySpeedIncrement;

    const enterSide = Math.floor(Math.random() * 4);
    const exitSide = (enterSide + 1 + Math.floor(Math.random() * 3)) % 4;
    const randomOnSide = (): number => Math.random() * area;

    const posOnSide = (side: number): { x: number; y: number } => {
      switch (side) {
        case 0: return { x: randomOnSide(), y: -margin };
        case 1: return { x: area + margin, y: randomOnSide() };
        case 2: return { x: randomOnSide(), y: area + margin };
        case 3: return { x: -margin, y: randomOnSide() };
        default: return { x: -margin, y: -margin };
      }
    };

    const start = posOnSide(enterSide);
    const end = posOnSide(exitSide);
    return { startX: start.x, startY: start.y, endX: end.x, endY: end.y, speed };
  }
}
