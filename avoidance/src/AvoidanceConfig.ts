import { SCREEN_TRANSITION_TYPES, type ScreenTransition } from "@gamebyte/gamelabsjs";

export class AvoidanceConfig {
  // Game area
  readonly gameAreaSize = 500;
  readonly gameAreaBorderWidth = 6;
  readonly gameAreaBorderColor = 0x44cc66;
  readonly gameAreaBgColor = 0x0a1a10;
  readonly gameAreaBgAlpha = 0.6;

  // Player
  readonly playerSize = 28;
  readonly playerSpeed = 200;

  // Enemy
  readonly enemySize = 22;
  readonly enemyBaseSpeed = 120;
  readonly enemySpeedIncrement = 15;

  // Collision
  readonly collisionShrink = 0.7;

  // Slow ability
  readonly slowAbilityDurationMs = 3000;
  readonly slowAbilityCooldownMs = 10000;
  readonly slowAbilityFactor = 0.5;

  // Camera shake on death
  readonly cameraShakeAmplitude = 22;
  readonly cameraShakeDurationMs = 450;

  // Particle FX
  readonly propulsionParticleSize = 8;
  readonly propulsionParticleColor = 0x88ee88;
  readonly propulsionMaxParticles = 200;
  readonly propulsionLifetimeMin = 0.3;
  readonly propulsionLifetimeMax = 0.6;
  readonly propulsionRateAtMaxSpeed = 80; // particles/sec when player is at full speed
  readonly propulsionEjectSpeedMin = 60;
  readonly propulsionEjectSpeedMax = 140;
  readonly propulsionAngleJitterRad = 0.4;
  readonly propulsionDrag = 1.5;
  readonly propulsionStartScale = 0.25;
  readonly propulsionEndScale = 2.5;

  readonly explosionParticleSize = 12;
  readonly explosionParticleColor = 0xff8844;
  readonly explosionMaxParticles = 80;
  readonly explosionLifetimeMin = 0.5;
  readonly explosionLifetimeMax = 1.0;
  readonly explosionBurstCount = 30;
  readonly explosionEjectSpeedMin = 100;
  readonly explosionEjectSpeedMax = 300;
  readonly explosionDrag = 2.5;

  // Waves
  readonly waveAnnounceDurationMs = 1500;
  readonly waveBaseEnemyCount = 10;
  readonly waveEnemyCountIncrement = 5;
  readonly waveBaseSpawnDelayMs = 800;
  readonly waveSpawnDelayDecrementMs = 50;
  readonly waveMinSpawnDelayMs = 150;
  readonly wavePauseBetweenMs = 1000;

  // Transitions
  readonly transitions: {
    gameScreenEnter: ScreenTransition;
  } = {
    gameScreenEnter: {
      type: SCREEN_TRANSITION_TYPES.INSTANT,
      durationMs: 0
    }
  };
}
