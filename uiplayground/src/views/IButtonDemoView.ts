import type { IView, Unsubscribe } from "@gamebyte/gamelabsjs";

/**
 * View interface for the Button demo. Drives two buttons:
 *   - one using the framework default skin (subject to the enabled toggle)
 *   - one using a playground-owned custom skin via asset-id override
 *
 * Width / height / label changes apply to both. The enabled toggle
 * applies only to the default button so the user can see a button that
 * shows the `disabled` texture next to one that doesn't.
 */
export interface IButtonDemoView extends IView {
  setWidth(width: number): void;
  setHeight(height: number): void;
  setLabel(label: string): void;
  setOutlineVisible(visible: boolean): void;
  setDefaultButtonEnabled(enabled: boolean): void;
  onPress(cb: (which: "default" | "custom") => void): Unsubscribe;
}
