import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * End card shown when the game ends (win or time-out): a scrim over the board, a
 * placeholder app icon, the game name and a pulsing "İNDİR" button that opens the
 * store. Created as a child of the HUD; the HUD forwards layout + show.
 */
export interface IEndView extends IView {
  /** Show/hide the card (hidden until the game ends). Showing plays the entrance. */
  setVisible(visible: boolean): void;
  /** Fires when the download button / card is tapped. */
  onDownload(cb: () => void): Unsubscribe;
  /** Lay out for the current play-rect + full canvas (forwarded by the HUD). */
  setLayout(safeX: number, safeY: number, safeW: number, safeH: number, fullW: number, fullH: number): void;
}
