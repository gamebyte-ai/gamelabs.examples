/**
 * A stack of colored blocks drawn bottom → top.
 *
 * `colors` are indices into {@link HexaSortConfig.blockColors}.
 */
export type BlockStack = {
  readonly id: number;
  readonly colors: readonly number[];
};
