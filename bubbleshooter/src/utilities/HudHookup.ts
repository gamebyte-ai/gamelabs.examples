import { OnScreenControlManager, UnsubscribeBag, type IInjectionTarget, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import { GameEvents } from "../events/GameEvents";
import { BubbleShooterUIIds } from "../BubbleShooterUIIds";

/**
 * Mirrors game-state events to OSC widget writes — bomb / fireball
 * count badges, power-up button enabled state, and the centred
 * win / game-over overlays. Lives in `utilities/` (not in a
 * controller) because it owns no view and its responsibility is
 * subsystem coordination, not view-input routing. Holds no mutable
 * state of its own — strictly a stateless event-routing strategy
 * (role-named, no `*Manager` suffix per AGENTS.md "Where logic lives").
 */
export class HudHookup implements IInjectionTarget {
  private readonly _subs = new UnsubscribeBag();
  private _events: GameEvents | null = null;
  private _osc: OnScreenControlManager | null = null;

  public inject(resolver: IInstanceResolver): void {
    this._events = resolver.getInstance(GameEvents);
    this._osc = resolver.getInstance(OnScreenControlManager);
  }

  public start(): void {
    const e = this._events!;
    const osc = this._osc!;
    this._subs.add(e.onBombCountChanged((count) => osc.setLabelText(BubbleShooterUIIds.BombCountLabel, `${count}`)));
    this._subs.add(e.onFireballCountChanged((count) => osc.setLabelText(BubbleShooterUIIds.FireballCountLabel, `${count}`)));
    this._subs.add(e.onPowerUpAvailabilityChanged(this._onPowerUpAvailability));
    this._subs.add(e.onGameWonChanged((won) => osc.setControlVisible(BubbleShooterUIIds.WinLabel, won)));
    this._subs.add(e.onGameOverChanged((over) => osc.setControlVisible(BubbleShooterUIIds.GameOverLabel, over)));
  }

  private readonly _onPowerUpAvailability = (bombEnabled: boolean, fireballEnabled: boolean): void => {
    this._osc?.setControlEnabled(BubbleShooterUIIds.BombButton, bombEnabled);
    this._osc?.setControlEnabled(BubbleShooterUIIds.FireballButton, fireballEnabled);
  };

  public destroy(): void {
    this._subs.flush();
    this._events = null;
    this._osc = null;
  }
}
