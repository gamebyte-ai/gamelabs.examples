import type { IInstanceResolver, IViewController } from "@gamebyte/gamelabsjs";
import type { IGeneratingPopupView } from "../views/IGeneratingPopupView.js";

/**
 * The "Generating level..." popup is purely a visual indicator and
 * input blocker — it owns no state. Lifecycle is driven externally by
 * GameScreenController via UIEvents.createPopup / removeTopPopup.
 */
export class GeneratingPopupViewController implements IViewController<IGeneratingPopupView> {
  public inject(_resolver: IInstanceResolver): void {}

  public initialize(_view: IGeneratingPopupView): void {}

  public destroy(): void {}
}
