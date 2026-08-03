import { UnsubscribeBag, AudioService } from "@gamebyte/gamelabsjs";
import type { IInstanceResolver, IViewController } from "@gamebyte/gamelabsjs";

import { type IGameScreenView } from "../views/IGameScreenView";
import { GameState } from "../utilities/GameState";
import { LEVELS } from "../utilities/LevelData";
import { findUnsolvableLevels } from "../utilities/LevelSolver";
import { ArrowGameAssetIds } from "../ArrowGameAssetIds";

/**
 * Coordinates the single 2D game view (HUD + board), the puzzle state, and audio.
 * The view renders everything in pixi (dot grid + rope arrows + arrowheads).
 * This controller owns no rendering objects and no domain rules beyond routing.
 */
export class GameScreenViewController implements IViewController<IGameScreenView> {
  private _view: IGameScreenView | null = null;
  private _audio: AudioService | null = null;
  private readonly _state = new GameState();
  private readonly _subs = new UnsubscribeBag();
  private _busy = false;

  public inject(resolver: IInstanceResolver): void {
    this._audio = resolver.getInstance(AudioService);
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

    this.loadLevel(0);
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
      this._view?.slideArrowOut(block, () => {
        const remaining = this._state.removeArrow(arrowId);
        if (remaining === 0) this.onLevelComplete();
      });
    } else {
      this._audio?.playSfx(ArrowGameAssetIds.SfxBlocked);
      this._view?.shakeArrow(arrowId);
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
