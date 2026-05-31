import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * Layout uses the classic Bubble Shooter offset-row scheme:
 * - even rows hold {@link wideRowColumns} bubbles flush to the left wall
 * - odd rows hold {@link wideRowColumns} - 1 bubbles, shifted right by one bubble radius
 * - vertical row pitch is `bubbleRadius * sqrt(3)` so neighboring bubbles touch
 */
export class BubbleShooterConfig {
  public readonly bubbleRadius = 20;
  public readonly wideRowColumns = 11;
  /**
   * Total rows in the grid model. Larger than {@link visibleRowCount}
   * so the grid extends below the play-area bottom — bubbles can
   * keep stacking past the lose line and trigger loss on snap,
   * instead of getting wedged at the natural grid bottom.
   */
  public readonly rowCount = 24;
  /**
   * Rows that determine the play-area visual extents (background,
   * border, camera fit). The grid model has more rows below this;
   * the extra ones extend off-screen so stacking doesn't run out
   * of valid landing cells before reaching the lose line.
   */
  public readonly visibleRowCount = 20;
  /**
   * Bottom rows left empty in the procedural initial layout. Tuned
   * against the total {@link rowCount} so the visible filled
   * portion stays the same as before the grid was extended.
   */
  public readonly initialEmptyBottomRows = 11;

  public readonly playAreaPaddingX = 16;
  public readonly playAreaPaddingTop = 16;
  /**
   * Space below the grid. Kept equal to {@link shooterMarginFromBottom}
   * so the grid's bottom edge lines up exactly with the shooter level
   * (the new lower rows act as the lose-line area).
   */
  public readonly playAreaPaddingBottom = 100;

  public readonly playAreaBgColor = 0x101822;
  public readonly playAreaBorderColor = 0x2a3a55;
  public readonly playAreaBorderWidth = 4;

  public readonly cellOutlineColor = 0x2f4769;
  public readonly cellOutlineThickness = 1.5;

  /**
   * Thin horizontal strip drawn along the grid's top edge —
   * makes the ceiling boundary clearly visible so the player can
   * read the descending-ceiling mechanic. Travels with the grid
   * (descents shift its Y), spans the full grid width.
   */
  public readonly gridCeilingStripColor = 0x88a0c8;
  public readonly gridCeilingStripThickness = 3;

  public readonly cameraMargin = 24;

  public readonly shooterRadius = 34;
  public readonly shooterMarginFromBottom = 70;
  public readonly shooterRingColor = 0x4a6280;
  public readonly shooterRingThickness = 2.5;
  public readonly shooterBarrelLength = 28;
  public readonly shooterBarrelThickness = 6;
  public readonly shooterBarrelColor = 0x6b86a8;
  /** Duration of the swap animation that moves held + next bubbles past each other. */
  public readonly shooterSwapDurationSeconds = 0.25;

  /** Next-bubble preview slot, drawn beside the shooter. */
  public readonly nextSlotOffsetX = 78;
  public readonly nextSlotOffsetY = -10;
  /** World-space side length of the swap-icon plane that frames the next bubble. */
  public readonly nextSlotIconSize = 44;
  /** Click hit-test radius around the next-slot centre (slightly forgiving vs the visible icon). */
  public readonly nextSlotClickRadius = 24;
  /** Visual scale of the bubble inside the next-slot ring (× bubbleRadius). */
  public readonly nextBubbleRadiusScale = 0.6;

  public readonly landingPreviewOpacity = 0.55;
  /** Ring thickness for the ghost landing preview (world units). */
  public readonly landingPreviewRingThickness = 2.5;

  public readonly aimDotRadius = 3.5;
  public readonly aimDotSpacing = 15;
  public readonly aimDotColor = 0xffffff;
  /** Aim dot colour while a power-up (bomb / fireball) is loaded into the held slot. */
  public readonly aimDotPowerUpColor = 0xff3030;
  public readonly aimDotAlpha = 0.6;
  /** Arc-length speed of the dot march, in world units per second. */
  public readonly aimDotFlowSpeed = 60;
  /**
   * Number of dots at the trajectory tail (closest to the landing) that
   * fade out toward the end. Earlier dots use full opacity. With the
   * default linear ramp, the last dot ends up at `1/(K+1)` of full
   * alpha and the K-th-from-end at `K/(K+1)`.
   */
  public readonly aimDotFadeTailCount = 4;
  /**
   * Hard cap on side-wall reflections inside the trajectory solver.
   * Set high enough that a shot at any aim angle in any supported
   * grid width always reaches either the cluster or the ceiling
   * before exhausting bounces — `fire` otherwise silently rejects
   * the shot because `_findLanding` only runs when the trajectory
   * ends on `"top"` or `"bubble"`. The dotted aim line is already
   * capped independently by {@link aimMaxLength} (arc length), so
   * a generous bounce ceiling doesn't visually grow the line.
   */
  public readonly aimMaxBounces = 32;
  /** Minimum angle from horizontal so aim never points sideways or down. */
  public readonly aimMinAngleFromHorizontalRad = (15 * Math.PI) / 180;
  /**
   * Maximum visible aim-line length, in world units. Trajectory
   * beyond this arc length is hidden by default — the dots stop
   * partway and the landing-preview ring is suppressed when the
   * actual landing sits past the cap. Future aim-extension power-
   * ups may temporarily increase this value.
   */
  public readonly aimMaxLength = 500;

  /** World units per second for the bubble's straight-line flight. */
  public readonly firedBubbleSpeed = 1500;

  /** Minimum same-colour group size that pops on snap. */
  public readonly matchPopThreshold = 3;

  /**
   * Descending-ceiling cadence — every N consecutive non-pop shots
   * (shots that didn't pop any bubble), the grid shifts down by one
   * `rowPitch`. Pops don't reset or advance the counter; only
   * non-pop shots advance it, and a successful descent resets it
   * to zero.
   */
  public readonly shotsPerDescend = 3;
  /**
   * Duration of the descent animation — the time the grid takes to
   * smoothly slide down by one `rowPitch`. Logical layout offsets
   * update instantly so trajectory + loss check use the new state;
   * the visual lag interpolates over this duration.
   */
  public readonly gridDescentDurationSeconds = 0.25;
  /**
   * Auto-descent target after a successful pop: the lowest occupied
   * cluster row should sit at this visual row index from the top of
   * the grid (1-indexed). When pops shrink the cluster too far
   * upward, the grid auto-slides down so the bottom of the cluster
   * lands at this position — keeps the play area populated and
   * matches the level's starting feel. Set high to disable
   * (cluster will never be auto-pushed down).
   */
  public readonly clusterBottomTargetRowsFromTop = 8;
  /**
   * World-space distance from the shooter's centre up to the lose
   * line. A bubble with `cell.y ≤ shooterY + loseLineDistanceFromShooter`
   * triggers loss.
   */
  public readonly loseLineDistanceFromShooter = 50;
  public readonly loseLineColor = 0xff5060;
  public readonly loseLineThickness = 2;

  /**
   * Bomb power-up inventory at game / level start. Power-ups are
   * primarily harvested from the grid via collection, so the
   * starting count is just a single seed.
   */
  public readonly initialBombCount = 1;
  /**
   * Number of hex rings the bomb explosion covers around its landing
   * cell. `1` = centre + 6 neighbours (7 cells). `2` = centre + 6 +
   * the next-out 12-cell ring (19 cells). `3` would be 37, etc.
   */
  public readonly bombBlastRingCount = 2;

  /** Fireball power-up inventory at game / level start. See {@link initialBombCount}. */
  public readonly initialFireballCount = 1;
  /**
   * Duration of the power-up collection animation — time from the
   * grid-cell origin to the matching HUD button. Eased with a cubic
   * t³ ramp so the icon starts slow and accelerates as it
   * approaches. The model defers the inventory bump until this
   * timer expires so the visible badge count always ticks up the
   * moment the icon arrives.
   */
  public readonly powerUpCollectDurationSeconds = 0.8;
  /** Fireball flight speed in world units per second. */
  public readonly fireballSpeed = 1500;
  /**
   * Centre-to-centre distance at which the fireball pops a cluster bubble
   * along its straight-line path. Default `2 · bubbleRadius` (= a clean
   * touch); raise to vacuum bubbles slightly off-axis.
   */
  public readonly fireballCollisionRadius = 40;

  /** Seconds between sequential bubble pops within a single match group. */
  public readonly popDelaySeconds = 0.05;
  /** Per-bubble score increment within a single pop sequence. */
  public readonly popPointsStep = 5;

  /** Particle burst — quick visual when a bubble pops. */
  public readonly popParticleCount = 8;
  public readonly popParticleSpeedMin = 60;
  public readonly popParticleSpeedMax = 130;
  public readonly popParticleLifetimeSeconds = 0.45;
  public readonly popParticleRadius = 3;

  /**
   * Snap shake — when a fired bubble settles into the grid, its hex
   * neighbours wobble outward (away from the snap cell) along a
   * damped sine, then oscillate through their resting positions a
   * couple of times before settling back. The motion is
   * `offset(t) = peak · exp(-decay·t) · sin(2π·freq·t)` so each
   * bubble starts at rest, snaps out, then jellies in/out with
   * shrinking amplitude.
   *
   * The shake propagates over {@link snapShakeRingCount} hex rings;
   * each successive ring's peak is scaled by
   * {@link snapShakeRingFalloff}^(depth-1) so closer bubbles wobble
   * more strongly.
   */
  public readonly snapShakePeakOffset = 8.0;
  public readonly snapShakeDurationSeconds = 0.82;
  /** Hex-ring depth the wobble propagates to (1 = immediate neighbours only). */
  public readonly snapShakeRingCount = 3;
  /** Per-ring peak multiplier. Ring `d` peak = `peak · falloff^(d-1)`. */
  public readonly snapShakeRingFalloff = 0.7;
  /** Wobble frequency in Hz — controls how many times the bubble swings within the lifetime. */
  public readonly snapShakeFrequencyHz = 4.2;
  /**
   * Damping coefficient. Amplitude at time `t` is multiplied by
   * `exp(-decay·t)`; tuned so that by `snapShakeDurationSeconds` the
   * bubble has decayed to ~5 % of its peak. Higher = settles faster.
   */
  public readonly snapShakeDecayRate = 7.5;

  /** Score-popup lifetime in seconds (text fades to zero opacity by then). */
  public readonly scorePopupLifetimeSeconds = 0.75;
  /** World units the score popup rises over its lifetime. */
  public readonly scorePopupRise = 36;
  /** Score popup plane width (world units); height auto-scales to canvas aspect. */
  public readonly scorePopupWidth = 50;

  /** Acceleration for disconnected falling bubbles, world units per second squared. */
  public readonly fallingBubbleGravity = 1200;
  /**
   * Outward radial separation impulse applied to each disconnected
   * bubble before it falls. Each bubble's initial velocity points away
   * from the group's centre of mass at this magnitude — the cluster
   * visibly breaks apart for a beat instead of dropping as a frozen
   * blob.
   */
  public readonly fallingBubbleSeparationImpulse = 100;
  /**
   * Extra upward velocity added on top of the radial separation impulse,
   * giving the disconnect a tiny "burst" feel before gravity pulls
   * everything down.
   */
  public readonly fallingBubbleSeparationUpBias = 70;
  /** Bonus points awarded when a falling bubble pops at the threshold. */
  public readonly fallingBubblePopPoints = 40;

  /**
   * Shrink applied to the bubble-vs-bubble collision radius (world units).
   * Effective centre-to-centre threshold becomes `2 · bubbleRadius -
   * bubbleCollisionTolerance`, so the flying bubble can squeeze through
   * gaps slightly tighter than its full diameter. The aim trajectory,
   * ghost landing preview, and actual fire all use the same value via
   * `AimTrajectoryCalculator`, so the predicted landing always matches
   * the real flight.
   */
  public readonly bubbleCollisionTolerance = 6.45;

  /**
   * Front camera focal-point Z. Pushes the camera back so bubble spheres
   * (radius ≈ {@link bubbleRadius}) sit comfortably between the ortho
   * near plane and the far plane. With `FRONT_OFFSET` = 5, anything more
   * than `bubbleRadius + 0.1` is enough; 200 leaves generous headroom.
   */
  public readonly cameraFocusZ = 500;

  // ── HUD button layout ─────────────────────────────────────────────
  // Sizes / spacings for the HUD strip below the shooter (bomb +
  // fireball + future power-ups, right-aligned) and the corner gear
  // and target buttons. Values are HUD pixels (OSC anchors measure
  // offsets in screen pixels), so they stay constant across grid
  // widths — no overlap with the shooter or next-bubble icon at any
  // `wideRowColumns`.

  /** Side length of each power-up button. */
  public readonly powerUpButtonSize = 44;
  /** Gap between adjacent power-up buttons in the bottom strip. */
  public readonly powerUpButtonGap = 10;
  /** Inset between the rightmost button's right edge and the play-area right edge. */
  public readonly powerUpButtonEdgeInset = 8;
  /** Inset from the button centre to the count-badge anchor (top-right of the button). */
  public readonly powerUpCountInset = 16;
  /** Bg-ring tint applied to the target button while the aim-aid is open. */
  public readonly targetButtonActiveBgColor = 0x33dd55;
  /** Bg-ring alpha applied alongside {@link targetButtonActiveBgColor}. */
  public readonly targetButtonActiveBgAlpha = 0.85;
  /**
   * Side length of the gear (settings) button in the top-right
   * corner. Slightly smaller than the power-up buttons so the corner
   * badge feels like a secondary affordance. The dev-only level
   * dropdown in `GameScreenView` is positioned just below this
   * button (top = `settingsButtonOffsetY + settingsButtonSize + 8` px),
   * so changing this size requires re-tuning that dropdown's `top`.
   */
  public readonly settingsButtonSize = 50;
  public readonly settingsButtonOffsetX = 16;
  public readonly settingsButtonOffsetY = 16;

  public readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0,
    },
  };
}
