/**
 * Termination reason for a computed aim trajectory:
 * - `"top"` — the bubble path stopped at the play-area / grid ceiling.
 * - `"bubble"` — it touched a cluster cell (the snap target).
 * - `"max-bounces"` — the side-wall reflection cap was reached
 *   (not a real obstacle; only used when no other terminator hit).
 * - `"none"` — no segments produced (e.g. degenerate aim).
 *
 * Constant-valued type → lives in `constants/` per the project's
 * "Constants" rule.
 */
export type AimTrajectoryEnd = "top" | "bubble" | "max-bounces" | "none";
