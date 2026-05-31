import type * as PIXI from "pixi.js";

/** Default sans-serif stack used for labels, titles, sidebar items. */
export const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

/** Monospace stack used for the event log and value readouts. */
export const MONO_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Width of the "label" column in a control row (`makeSliderRow` etc.). */
export const LABEL_WIDTH = 90;

/** Width of the "readout" column in a control row. */
export const READOUT_WIDTH = 64;

/** Text style for control-row labels. */
export const LABEL_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0xcbd5e0,
  fontSize: 15,
  fontWeight: "600", 
  fontFamily: FONT_FAMILY,
};

/** Text style for control-row value readouts. */
export const READOUT_STYLE: Partial<PIXI.TextStyleOptions> = {
  fill: 0x4ade80,
  fontSize: 13,
  fontWeight: "700",
  fontFamily: MONO_FAMILY,
};
