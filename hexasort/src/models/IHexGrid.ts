import { InjectionToken, type IHexGrid as IHexGridFramework } from "@gamebyte/gamelabsjs";

/**
 * Re-export of the framework's `IHexGrid` readonly view, paired with an
 * `InjectionToken` for DI resolution. Controllers and views resolve this
 * interface; only `GameOperations` and `SortingManager` resolve the
 * concrete `HexGrid` class and own the mutations.
 */
export type IHexGrid = IHexGridFramework;
export const IHexGrid = new InjectionToken<IHexGrid>("IHexGrid");
