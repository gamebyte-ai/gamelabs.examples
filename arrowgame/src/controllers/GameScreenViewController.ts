import { UnsubscribeBag, AudioService } from "@gamebyte/gamelabsjs";
import type { IInstanceResolver, IViewController } from "@gamebyte/gamelabsjs";

import { type IGameScreenView } from "../views/IGameScreenView";
import { GameState } from "../utilities/GameState";
import { LEVELS } from "../utilities/LevelData";
import { findUnsolvableLevels } from "../utilities/LevelSolver";
import { ArrowGameAssetIds } from "../ArrowGameAssetIds";
import { ArrowGameConfig } from "../ArrowGameConfig";

/**
 * Coordinates the single 2D game view (HUD + board), the puzzle state, and audio.
 * The view renders everything in pixi (dot grid + rope arrows + arrowheads).
 * This controller owns no rendering objects and no domain rules beyond routing.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _audio: AudioService | null = null;
  private _config: ArrowGameConfig | null = null;
  private readonly _state = new GameState();
  private readonly _subs = new UnsubscribeBag();
  private _busy = false;

  public inject(resolver: IInstanceResolver): void {
    this._audio = resolver.getInstance(AudioService);
    this._config = resolver.getInstance(ArrowGameConfig);
    // Oyun sesleri KAPALI (SFX + müzik). Tek noktadan global mute — çalma
    // çağrıları yerinde kalıyor, sadece susuyor. Geri açmak için `true` → `false`.
    this._audio?.setMasterMute(true);
  }

  public initialize(view: IGameScreenView): void {
    this._view = view;

    // Boot-time guard: every level must be solvable. Warns loudly in the
    // console for any deadlocked/malformed level so bad designs never ship
    // silently (also covers future hand-authored levels).
    const problems = findUnsolvableLevels(LEVELS);
    for (const p of problems) {
      console.error(`[LevelSolver] Level ${p.index + 1} is UNSOLVABLE: ${p.reason}`);
    }

    this._view.onRestart(() => this.restartLevel());
    this._view.onArrowTapped((id) => this.onArrowTapped(id));

    // Start background music (looped).
    this._audio?.playMusic(ArrowGameAssetIds.BgmGameplay, { loop: true, volume: 0.5 });

    // TEST/DEBUG: boot into the configured start level (1-based in config,
    // clamped to a valid 0-based index). Change `startLevel` to test any level.
    const start = (this._config?.startLevel ?? 1) - 1;
    const startIndex = Math.min(Math.max(start, 0), LEVELS.length - 1);
    this.loadLevel(startIndex);
  }

  private loadLevel(index: number): void {
    const level = LEVELS[index];
    if (!level) return;
    this._busy = false;
    this._state.loadLevel(level, index);
    this._view?.hideLevelComplete();
    this._view?.setLevelLabel(index + 1);
    this._view?.buildLevel(level, this._state.arrows);
  }

  private restartLevel(): void {
    this._audio?.playSfx(ArrowGameAssetIds.SfxClick);
    this.loadLevel(this._state.levelIndex);
  }

  private onArrowTapped(arrowId: number): void {
    if (this._busy) return;

    if (this._state.canSlide(arrowId)) {
      const block = this._state.getArrow(arrowId);
      if (!block) return;
      this._audio?.playSfx(ArrowGameAssetIds.SfxSlide);
      // It has a clear lane → it WILL leave the board. Mark it gone in the state
      // NOW (not when the animation ends) so it immediately stops counting as an
      // obstacle for any arrow tapped while its slide-out is still playing.
      const remaining = this._state.removeArrow(arrowId);
      this._view?.slideArrowOut(block, () => {
        if (remaining === 0) this.onLevelComplete();
      });
    } else {
      this._audio?.playSfx(ArrowGameAssetIds.SfxBlocked);
      // Blocked: lunge forward into the obstacle and flash red on return. Works
      // for both a multi-cell gap AND an adjacent obstacle (adv=0 → partial bump
      // into the obstacle cell). Plain shake only if there is no obstacle.
      const block = this._state.getArrow(arrowId);
      const obstacleId = this._state.blockedObstacleId(arrowId);
      if (block && obstacleId >= 0) {
        const adv = this._state.blockedAdvance(arrowId);
        this._view?.nudgeArrow(block, adv, obstacleId, () => {});
      } else {
        this._view?.shakeArrow(arrowId);
      }
    }
  }

  private onLevelComplete(): void {
    this._busy = true;
    this._audio?.playSfx(ArrowGameAssetIds.SfxWin);
    this._view?.showLevelComplete(() => this.onNext());
  }

  private onNext(): void {
    this._audio?.playSfx(ArrowGameAssetIds.SfxClick);
    const next = this._state.levelIndex + 1;
    if (next < LEVELS.length) this.loadLevel(next);
    else this.loadLevel(0); // loop back to level 1 in prototype
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._audio = null;
  }
}
