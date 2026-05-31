import * as PIXI from "pixi.js";
import { ScreenView } from "@gamebyte/gamelabsjs";
import type { IGameScreenView } from "./IGameScreenView";
import { TopBarView } from "./TopBarView.pixi";
import { DebugBarView } from "./DebugBarView.pixi";

/**
 * HelloWorld gameplay screen (Pixi).
 *
 * This is created at app start with an instant transition.
 * Keep it visually subtle so it doesn't obscure the Three.js world layer.
 */
export class GameScreenView extends ScreenView implements IGameScreenView {
  private readonly overlay = new PIXI.Graphics();

  private topBar: TopBarView | null = null;
  private debugBar: DebugBarView | null = null;

  public override postInitialize(): void {
    super.postInitialize();

    // Invisible overlay to define bounds + potential future interactions.
    this.overlay.layout = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
    if (!this.overlay.parent) this.addChild(this.overlay);

    // View owns subview creation.
    this.topBar = this.viewFactory.createView(TopBarView);
    this.addChild(this.topBar);

    this.debugBar = this.viewFactory.createView(DebugBarView);
    this.addChild(this.debugBar);

    // Layout children: fill width, take intrinsic height.
    this.topBar.layout = { width: "100%" };
    this.debugBar.layout = { width: "100%" };
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    // Flex column: top bar at top, debug bar below it.
    this.layout = {
      width: Math.max(1, width),
      height: Math.max(1, height),
      flexDirection: "column",
      justifyContent: "flex-start",
      padding: 16,
      gap: 12,
    };

    this.overlay.clear();
    // Transparent overlay; keeps the screen non-obtrusive while defining bounds.
    this.overlay.rect(0, 0, Math.max(1, width), Math.max(1, height)).fill({ color: 0x000000, alpha: 0 });

    // Keep these calls for the current view contracts; layout does most of the work.
    this.topBar?.resize(width, height);
    this.debugBar?.resize(width, height);
  }

  public override preDestroy(): void {
    this.topBar?.destroy();
    this.topBar = null;
    this.debugBar?.destroy();
    this.debugBar = null;
  }
}

