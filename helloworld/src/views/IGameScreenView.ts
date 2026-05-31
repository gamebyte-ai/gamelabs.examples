import type { IScreenView } from "@gamebyte/gamelabsjs";

/**
 * HelloWorld "gameplay" screen contract.
 *
 * For now this is just a resize-aware screen view, but it gives us a stable
 * place to add screen-specific APIs later (HUD hooks, overlays, etc.).
 */
export interface IGameScreenView extends IScreenView {
}

