import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

/**
 * Constants and tweakable values for the tower defense game.
 *
 * Strictly read-only — no methods that mutate state, no per-run state.
 * Path generation, cell-type queries and colour lookups previously
 * lived here but were moved to {@link LevelManager} per the rule
 * "MyGameConfig.ts: initial values, tweaks, timings, sizes, animation
 * values".
 */
export class TowerDefenseConfig {
  public static readonly GRID_ID = 1;

  public readonly cols = 12;
  public readonly rows = 12;
  public readonly cellSize = 1.0;

  // ── Camera ────────────────────────────────────────────────────────────

  public readonly cameraDistance = 10;
  public readonly cameraAzimuth = Math.PI / 4;
  public readonly cameraPitch = Math.PI / 4;
  public readonly cameraMinDistance = 6;
  public readonly cameraMaxDistance = 15;

  // ── Cell colours ──────────────────────────────────────────────────────

  public readonly groundColor = 0x888888;
  public readonly towerColor = 0x4488cc;
  public readonly pathColor = 0xddcc44;
  public readonly spawnColor = 0xcc4444;
  public readonly baseColor = 0xdd8844;

  public readonly cellElevation = 0.01;

  // ── Enemies ───────────────────────────────────────────────────────────

  /** Seconds between spawn-group triggers. */
  public readonly spawnGroupInterval = 3.5;
  /** Min members per spawn group. */
  public readonly spawnGroupMin = 2;
  /** Max members per spawn group. */
  public readonly spawnGroupMax = 5;
  /** Seconds between individual spawns within a group (min). */
  public readonly spawnMemberDelayMin = 0.6;
  /** Seconds between individual spawns within a group (max). */
  public readonly spawnMemberDelayMax = 1.0;
  /** After this many groups, Brute becomes possible. */
  public readonly bruteUnlockGroup = 5;
  /** Chance a group member is a Brute (0–1) after unlock. */
  public readonly bruteChance = 0.3;

  /** Maximum lateral offset from the path center (world units). */
  public readonly enemyLateralOffsetMax = 0.25;

  // ── Enemy physics ────────────────────────────────────────────────────

  /** Acceleration toward the current waypoint target. */
  public readonly enemySteeringForce = 4.0;
  /** Repulsion strength between overlapping enemies. */
  public readonly enemySeparationForce = 3.0;
  /** Distance at which enemy–enemy separation activates. */
  public readonly enemySeparationRadius = 0.5;
  /** Push force when an enemy enters a non-path cell. */
  public readonly enemyCellRepulsionForce = 10.0;
  /** Velocity damping rate — controls how quickly velocity decays. */
  public readonly enemyDamping = 3.5;
  /** How close an enemy must get to a waypoint before advancing. */
  public readonly enemyWaypointRadius = 0.4;
  /** Duration of movement slow after knockback (seconds). */
  public readonly knockbackSlowDuration = 0.3;
  /** Speed multiplier during knockback slow (0–1). */
  public readonly knockbackSlowFactor = 0.5;

  // ── Camera ───────────────────────────────────────────────────────────

  /** Minimum pitch in radians — prevents the camera going below the grid. */
  public readonly cameraMinPitch = 0.15;
  /** Factor for shifting follow target toward cursor on zoom-in. */
  public readonly zoomTowardCursorFactor = 0.08;

  // ── Cannon arc ───────────────────────────────────────────────────────

  /** Peak height of the cannon's parabolic arc per unit of distance. */
  public readonly cannonArcHeightFactor = 0.7;

  // ── Economy ───────────────────────────────────────────────────────────

  /** Gold given every `passiveIncomeInterval` seconds. */
  public readonly passiveIncomeAmount = 15;
  /** Seconds between passive income ticks. */
  public readonly passiveIncomeInterval = 4;

  public readonly startingGold = 350;
  public readonly baseHp = 1000;

  public readonly transitions: { gameScreenEnter: ScreenTransition } = {
    gameScreenEnter: { type: SCREEN_TRANSITION_TYPES.INSTANT, durationMs: 0 },
  };
}
