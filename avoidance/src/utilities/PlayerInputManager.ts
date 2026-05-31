import {
  ControlAnchor,
  ControlType,
  InputMapper,
  KeyboardListener,
  OnScreenControlManager,
  type IInstanceResolver,
} from "@gamebyte/gamelabsjs";
import { AvoidanceAssetIds } from "../AvoidanceAssetIds.js";
import { GameEvents } from "../events/GameEvents.js";
import { GameOperations } from "./GameOperations.js";

const SLOW_BUTTON_ID = "slow";

export class PlayerInputManager {
  private _mapper: InputMapper | null = null;

  public inject(resolver: IInstanceResolver): void {
    const keyboard = resolver.getInstance(KeyboardListener);
    const gameEvents = resolver.getInstance(GameEvents);
    const onScreenControls: OnScreenControlManager = resolver.getInstance(OnScreenControlManager);
    const ops = resolver.getInstance(GameOperations);

    // Joystick: tinted green over the framework's default base/handle
    // textures (loaded automatically via OnScreenControlsBinding).
    onScreenControls.addControl({
      type: ControlType.Joystick,
      id: "move",
      anchor: ControlAnchor.BottomRight,
      offsetX: 120,
      offsetY: 120,
      baseSize: 60,
      knobSize: 25,
      dynamic: false,
      threshold: 0.2,
      base: { color: 0x44cc66, alpha: 0.85 },
      knob: { color: 0x44cc66, alpha: 0.95 },
    });

    // Slow-time ability button — bottom-left, with a clock icon
    // overlay. Visual colors come from the `osc.button` StyleManager
    // entry (re-themed in `AvoidanceApp.configureDI`). Pressing asks
    // the game operations to start the slow effect; the ability state
    // event drives the disabled visual.
    onScreenControls.addControl({
      type: ControlType.Button,
      id: SLOW_BUTTON_ID,
      anchor: ControlAnchor.BottomLeft,
      offsetX: 120,
      offsetY: 120,
      size: 88,
      icon: { textureId: AvoidanceAssetIds.SlowIcon, scaleX: 0.55, scaleY: 0.55 },
    });

    gameEvents.onSlowAbilityChanged((enabled) => {
      onScreenControls.setControlEnabled(SLOW_BUTTON_ID, enabled);
      // Show the recharge ring while the ability is unavailable; hide
      // it the moment it returns to ready.
      if (enabled) onScreenControls.hideButtonProgress(SLOW_BUTTON_ID);
      else onScreenControls.showButtonProgress(SLOW_BUTTON_ID);
    });
    gameEvents.onSlowAbilityProgressChanged((t) => onScreenControls.setButtonProgress(SLOW_BUTTON_ID, t));

    this._mapper = new InputMapper();
    this._mapper.addDeviceListener(keyboard);
    this._mapper.addDeviceListener(onScreenControls);

    this._mapper.addDirectionAction("move", (x, y) => { gameEvents.emitDirectionInput(x, y); });
    this._mapper.addButtonAction("slow", (isPressed) => {
      if (isPressed) ops.tryActivateSlow();
    });

    // Keyboard
    this._mapper.mapKeysToDirection(keyboard.deviceId, "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "move");
    this._mapper.mapKeysToDirection(keyboard.deviceId, "KeyW", "KeyS", "KeyA", "KeyD", "move");
    this._mapper.mapKeyToAction(keyboard.deviceId, "Space", "slow");

    // On-screen joystick — analog mapping so the player speed scales
    // with knob distance instead of snapping to unit vectors at the
    // 0.2 threshold.
    this._mapper.mapRangesToDirection(onScreenControls.deviceId, "move.x", "move.y", "move");
    this._mapper.mapKeyToAction(onScreenControls.deviceId, SLOW_BUTTON_ID, "slow");
  }
}
