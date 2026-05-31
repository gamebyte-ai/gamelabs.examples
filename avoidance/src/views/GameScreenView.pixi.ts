import { OnScreenControlsView, ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";

export class GameScreenView extends ScreenView implements IGameScreenView {
  private _onScreenControls: OnScreenControlsView | null = null;

  public override postInitialize(): void {
    super.postInitialize();

    // The wave label and "WAVE N" announce text are registered as
    // OscLabel controls on the manager (see AvoidanceApp.configureDI).
    // Their content is updated through `manager.setLabelText` from the
    // game flow.
    this._onScreenControls = this.viewFactory.createView(OnScreenControlsView);
    this.addChild(this._onScreenControls);
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this.layout = { width: Math.max(1, width), height: Math.max(1, height) };
    this._onScreenControls?.resize(width, height);
  }

  public override preDestroy(): void {
    this._onScreenControls?.destroy();
    this._onScreenControls = null;
  }
}
