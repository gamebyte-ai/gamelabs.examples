import {
  ButtonComponent,
  LabelComponent,
  RadioButtonGroupComponent,
  ScreenView,
  UIComponentsStyleIds,
  type ButtonComponentStyle,
  type LabelComponentStyle,
  type RadioButtonComponentStyle,
  type Unsubscribe,
} from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";

// Undo button sizing. The label text + colour come from the resolved
// `UIComponentsStyleIds.Button` style; the per-button geometry below
// keeps the corner-pinned footprint matching the radio group on the
// opposite side. The brown-tint matches the tableau slot palette so the
// HUD reads as part of the same game surface.
const UNDO_BUTTON_WIDTH = 96;
const UNDO_BUTTON_HEIGHT = 44;
const UNDO_BUTTON_MARGIN = 16;
const UNDO_BUTTON_TINT = 0x4a3a1a;
const UNDO_BUTTON_LABEL_SIZE = 18;

// HUD label sizing + positioning. The shared font family / weight come
// from the resolved Label style (with a per-call font-size override);
// the corner pinning comes from the screen-side absolute layout.
const HUD_LABEL_SIZE = 22;
const HUD_LABEL_MARGIN = 16;

// Centered end-state overlay. Larger than the other HUD labels so a
// terminal state reads clearly over the board layout. The base label
// renders in white; the per-state colour is applied via the label's
// container tint in `setEndStateLabel`.
const END_STATE_LABEL_SIZE = 56;

// Turn 1 / Turn 3 radio group sits in the bottom-left corner, mirror
// of the undo button at bottom-right. Uses the framework's
// RadioButtonGroupComponent with the default radio skin from
// UIComponentsBinding — group owns mutual exclusion, silent
// programmatic updates, and no-op-on-reselect.
const TURN_GROUP_MARGIN = 16;
const TURN_GROUP_SPACING = 20;
// Stable per-item ids; mapped to/from the runtime drawCount value.
const TURN_ITEM_ID_1 = "turn-1";
const TURN_ITEM_ID_3 = "turn-3";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly _undoListeners = new Set<() => void>();
  private readonly _drawCountListeners = new Set<(drawCount: number) => void>();
  private _scoreLabel: LabelComponent | null = null;
  private _timeLabel: LabelComponent | null = null;
  private _endStateLabel: LabelComponent | null = null;
  private _undoButton: ButtonComponent | null = null;
  private _undoPressUnsub: Unsubscribe | null = null;
  private _turnGroup: RadioButtonGroupComponent | null = null;
  private _turnGroupUnsub: Unsubscribe | null = null;

  public override postInitialize(): void {
    super.postInitialize();

    this._scoreLabel = this.buildHudLabel("Score: 0");
    this._scoreLabel.layout = { position: "absolute", left: HUD_LABEL_MARGIN, top: HUD_LABEL_MARGIN };
    this.addChild(this._scoreLabel);

    this._timeLabel = this.buildHudLabel("00:00");
    this._timeLabel.layout = { position: "absolute", right: HUD_LABEL_MARGIN, top: HUD_LABEL_MARGIN };
    this.addChild(this._timeLabel);

    this._endStateLabel = this.buildEndStateLabel();
    this._endStateLabel.visible = false;
    this.addChild(this._endStateLabel);

    this._undoButton = this.buildUndoButton();
    this.addChild(this._undoButton);
    this._undoPressUnsub = this._undoButton.onPress(() => this.onUndoPressed());

    this._turnGroup = this.buildTurnRadioGroup();
    this.addChild(this._turnGroup);
    this._turnGroupUnsub = this._turnGroup.onChange((id) => this.onTurnGroupChanged(id));
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);

    // The corner-pinned HUD widgets (score / time labels, undo button,
    // turn radio group) all use `position: "absolute"` with edge
    // offsets, which @pixi/layout resolves against the SCREEN's own
    // layout box. Without this width/height the containing block has
    // zero size and every child stacks at (0, 0).
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };

    if (this._endStateLabel) {
      // Anchored at (0.5, 0.5); position via raw x/y rather than layout
      // so centering doesn't depend on the screen's flex container.
      this._endStateLabel.x = Math.max(1, width) / 2;
      this._endStateLabel.y = Math.max(1, height) / 2;
    }
  }

  public onUndoClicked(callback: () => void): Unsubscribe {
    this._undoListeners.add(callback);
    return () => {
      this._undoListeners.delete(callback);
    };
  }

  public setScoreText(text: string): void {
    this._scoreLabel?.setText(text);
  }

  public setTimeText(text: string): void {
    this._timeLabel?.setText(text);
  }

  public setEndStateLabel(appearance: { readonly text: string; readonly color: number } | null): void {
    if (!this._endStateLabel) return;
    if (appearance === null) {
      this._endStateLabel.visible = false;
      return;
    }
    this._endStateLabel.setText(appearance.text);
    // Per-state colour comes through Container.tint — the resolved
    // label style keeps the base text colour at white (0xffffff) so the
    // tint multiplies cleanly to the desired hue without lossy blends.
    this._endStateLabel.tint = appearance.color;
    this._endStateLabel.visible = true;
  }

  public setDrawCountMode(drawCount: number): void {
    // Silent on the group — does not trigger onChange, so this
    // controller-driven sync never loops back into the listener.
    this._turnGroup?.setSelectedId(GameScreenView.idFromDrawCount(drawCount));
  }

  public onDrawCountSelected(callback: (drawCount: number) => void): Unsubscribe {
    this._drawCountListeners.add(callback);
    return () => {
      this._drawCountListeners.delete(callback);
    };
  }

  public override preDestroy(): void {
    this._undoListeners.clear();
    this._drawCountListeners.clear();
    this._undoPressUnsub?.();
    this._undoPressUnsub = null;
    this._turnGroupUnsub?.();
    this._turnGroupUnsub = null;
    super.preDestroy();
  }

  private onUndoPressed(): void {
    for (const cb of this._undoListeners) cb();
  }

  /**
   * Forwards a turn-radio selection into the external listener set
   * after mapping the item id back to a drawCount. Ignores any id
   * that doesn't map to a known turn mode.
   */
  private onTurnGroupChanged(id: string): void {
    const drawCount = GameScreenView.drawCountFromId(id);
    if (drawCount === null) return;
    for (const cb of this._drawCountListeners) cb(drawCount);
  }

  /**
   * Builds the framework {@link ButtonComponent} for the undo action.
   * The default Button skin from `UIComponentsBinding` carries the
   * 9-slice sprite + per-state hover/pressed/disabled visuals; the
   * brown tint matches the tableau palette and the label-size override
   * keeps "Undo" readable at the corner-pinned 96×44 footprint.
   */
  private buildUndoButton(): ButtonComponent {
    const style = this.styleManager.resolve<ButtonComponentStyle>(UIComponentsStyleIds.Button, {
      label: { fontSize: UNDO_BUTTON_LABEL_SIZE, fontWeight: "600" },
    });
    const button = new ButtonComponent(this.assetLoader, style, {
      width: UNDO_BUTTON_WIDTH,
      height: UNDO_BUTTON_HEIGHT,
      label: "Undo",
    });
    button.tint = UNDO_BUTTON_TINT;
    button.layout = {
      position: "absolute",
      right: UNDO_BUTTON_MARGIN,
      bottom: UNDO_BUTTON_MARGIN,
      width: UNDO_BUTTON_WIDTH,
      height: UNDO_BUTTON_HEIGHT,
    };
    return button;
  }

  /**
   * Builds the framework `RadioButtonGroupComponent` with two items
   * (Turn 1, Turn 3) using the default radio skin from
   * `UIComponentsBinding`. The group owns the mutual-exclusion model,
   * silent programmatic selection (`setSelectedId`), and the
   * no-op-on-reselect semantics; we only forward its `onChange` to
   * external listeners after mapping the item id back to a drawCount.
   */
  private buildTurnRadioGroup(): RadioButtonGroupComponent {
    const style = this.styleManager.resolve<RadioButtonComponentStyle>(UIComponentsStyleIds.RadioButton);
    const group = new RadioButtonGroupComponent(this.assetLoader, style, {
      items: [
        { id: TURN_ITEM_ID_1, label: "Turn 1" },
        { id: TURN_ITEM_ID_3, label: "Turn 3" },
      ],
      selectedId: TURN_ITEM_ID_3,
      direction: "row",
      spacing: TURN_GROUP_SPACING,
    });
    group.layout = {
      position: "absolute",
      left: TURN_GROUP_MARGIN,
      bottom: TURN_GROUP_MARGIN,
    };
    return group;
  }

  private static idFromDrawCount(drawCount: number): string {
    return drawCount === 1 ? TURN_ITEM_ID_1 : TURN_ITEM_ID_3;
  }

  private static drawCountFromId(id: string): number | null {
    if (id === TURN_ITEM_ID_1) return 1;
    if (id === TURN_ITEM_ID_3) return 3;
    return null;
  }

  private buildHudLabel(initialText: string): LabelComponent {
    const style = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: HUD_LABEL_SIZE, fontWeight: "600", color: 0xffffff },
    });
    return new LabelComponent(this.assetLoader, style, { text: initialText });
  }

  private buildEndStateLabel(): LabelComponent {
    const style = this.styleManager.resolve<LabelComponentStyle>(UIComponentsStyleIds.Label, {
      text: { fontSize: END_STATE_LABEL_SIZE, fontWeight: "700", color: 0xffffff },
    });
    return new LabelComponent(this.assetLoader, style, { text: "", anchorX: 0.5, anchorY: 0.5 });
  }
}
