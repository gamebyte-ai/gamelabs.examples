import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * Live preview surface for the Settings module demo. The stage carries
 * a single gear button styled like the in-HUD settings button used
 * across the game examples; pressing it fires `onSettingsTapped`,
 * which the controller wires to
 * `UIEvents.createPopup(SettingsUIIds.SettingsPopup)`.
 */
export interface ISettingsModuleDemoView extends IView {
  /** Fires when the user taps the gear button. */
  onSettingsTapped(cb: () => void): Unsubscribe;
}
