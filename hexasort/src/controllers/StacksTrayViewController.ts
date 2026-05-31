import { UnsubscribeBag, type IInstanceResolver, type IViewController } from "@gamebyte/gamelabsjs";
import { IStacksTray } from "../models/IStacksTray.js";
import type { BlockStack } from "../models/BlockStack.js";
import { GameEvents } from "../events/GameEvents.js";
import { GameOperations } from "../utilities/GameOperations.js";
import type { IStacksTrayView } from "../views/IStacksTrayView.js";

/**
 * Stacks-tray-side drag & drop orchestration.
 *
 * - builds the tray from the {@link IStacksTray} model (readonly),
 * - on a stack press, emits `onStackPickedUp` so the grid can enter drop
 *   mode and highlight targets,
 * - on pointer release, emits `onStackReleased`; the grid decides whether
 *   to place or cancel and emits back,
 * - on a successful placement, removes the consumed slot's visual and
 *   asks `GameOperations` to mint a fresh stack into the same slot,
 * - on a cancelled drop, resets the stack visual to its home.
 *
 * Slot identity is recovered via {@link IStacksTray.findSlotByStackId}
 * at event time, rather than latched in controller state — so there is
 * no window in which the controller can hold a stale `_activeSlot`.
 *
 * Never holds the mutable {@link StacksTray} — all slot writes go through
 * {@link GameOperations.refillTraySlot}.
 */
export class StacksTrayViewController implements IViewController<IStacksTrayView> {
  private _tray: IStacksTray | null = null;
  private _events: GameEvents | null = null;
  private _ops: GameOperations | null = null;
  private _view: IStacksTrayView | null = null;
  private readonly _subs = new UnsubscribeBag();

  public inject(resolver: IInstanceResolver): void {
    this._tray = resolver.getInstance(IStacksTray);
    this._events = resolver.getInstance(GameEvents);
    this._ops = resolver.getInstance(GameOperations);
  }

  public initialize(view: IStacksTrayView): void {
    if (!this._tray || !this._events || !this._ops) throw new Error("StacksTrayViewController is not initialized");
    this._view = view;

    view.buildTray(this._tray.getAllSlots());

    this._subs.add(view.onStackPressed((slotIndex) => this._handleStackPressed(slotIndex)));
    this._subs.add(view.onPointerReleased(() => this._handlePointerReleased()));
    this._subs.add(this._events.onStackPlaced((stack) => this._handleStackPlaced(stack)));
    this._subs.add(this._events.onStackDropCancelled((stack) => this._handleStackDropCancelled(stack)));
  }

  public destroy(): void {
    this._subs.flush();
    this._view = null;
    this._tray = null;
    this._events = null;
    this._ops = null;
  }

  private _handleStackPressed(slotIndex: number): void {
    if (!this._tray || !this._events) return;
    const stack = this._tray.getSlot(slotIndex);
    if (!stack) return;
    this._events.emitStackPickedUp(stack);
  }

  private _handlePointerReleased(): void {
    // The view only emits release while a drag is in flight, so no
    // guard is needed here — the grid controller decides placed vs
    // cancelled.
    this._events?.emitStackReleased();
  }

  private _handleStackPlaced(stack: BlockStack): void {
    if (!this._tray || !this._view || !this._ops) return;
    // Grid mutates its own state first, but the tray is still holding
    // this stack at the origin slot at event-fire time.
    const slotIndex = this._tray.findSlotByStackId(stack.id);
    if (slotIndex < 0) return;

    this._view.removeSlotVisual(slotIndex);
    const replacement = this._ops.refillTraySlot(slotIndex);
    this._view.addSlotStack(slotIndex, replacement);
  }

  private _handleStackDropCancelled(stack: BlockStack): void {
    if (!this._tray || !this._view) return;
    const slotIndex = this._tray.findSlotByStackId(stack.id);
    if (slotIndex < 0) return;
    this._view.resetSlotVisual(slotIndex);
  }
}
