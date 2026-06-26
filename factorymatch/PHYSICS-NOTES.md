# FactoryMatch — Physics notes & framework-change handoff

This file preserves the physics work done for FactoryMatch so that:

1. The **gamelabs.js maintainer** can review the framework additions independently
   and decide whether to merge them.
2. The example's **regional wake/sleep + fan-fluidise** design is not lost — it can
   be restored verbatim once (if) the framework changes land on `main`.

Status when this file was written:

- Framework (`gamelabs.js`) changes live **only** on branch
  `feat/physics3d-sleep-wake` (also on `origin`). `gamelabs.js` working tree is on
  `main`. **Do not touch that branch** — it is pending maintainer review.
- The example (`gamelabs.examples/factorymatch`) has been **decoupled** from those
  framework changes so it builds and runs against `main` (see
  "Main-compatible version" below). The framework-dependent code documented here
  was removed from `FactoryOperations.ts`.

---

## 1. Framework changes (gamelabs.js) — pending review

Branch `feat/physics3d-sleep-wake`, 2 commits, **one file**:
`src/modules/physics3d/src/Physics3DManager.ts` (+32 / -1).

```
217945b feat(physics3d): runtime setDefaultFriction on Physics3DManager
17a01d9 feat(physics3d): expose Body sleep/wakeUp on Physics3DManager
```

The full diff vs `main`:

```diff
@@ private readonly _worldMaterial: CANNON.Material;
-  private readonly _defaultFriction: number;
+  private _defaultFriction: number;
   private readonly _defaultRestitution: number;
@@ (after the existing wakeUp-using method, ~line 240)
+  /**
+   * Put a body to sleep immediately: the solver skips it (it won't move or jitter)
+   * until something wakes it — a {@link wakeUp} call, an applied force/velocity, or
+   * a collision. Lets callers simulate only part of the world. No-op for unknown ids.
+   */
+  public sleep(id: BodyId): void {
+    this._records.get(id)?.body.sleep();
+  }
+
+  /** Wake a sleeping body so it simulates again. No-op for unknown ids. */
+  public wakeUp(id: BodyId): void {
+    this._records.get(id)?.body.wakeUp();
+  }
+
+  /**
+   * Set the friction of the shared world contact material at runtime — governs
+   * contacts between bodies that use the default material (those created without a
+   * per-body `friction`/`restitution`). Lets callers briefly make the pile slippery
+   * (e.g. to fluidise it) and restore it after. Bodies with a custom material are
+   * unaffected.
+   */
+  public setDefaultFriction(friction: number): void {
+    this._defaultFriction = friction;
+    this._world.defaultContactMaterial.friction = friction;
+  }
+
+  /** Current default contact friction (so callers can restore it after a change). */
+  public get defaultFriction(): number {
+    return this._defaultFriction;
+  }
```

**Why these were added** — the example wanted to (a) simulate only part of the
pile (a "wake region" around a pick / the fan) so idle items can't jitter, and
(b) briefly drop item↔item friction so the fan can fluidise a packed pile. cannon
already supports `body.sleep()/wakeUp()` and a runtime contact-material friction;
the manager just didn't expose them. The additions are **purely additive** and
default-preserving (no behaviour change for other examples): `allowSleep` is
already `true` by default and nothing calls the new methods unless asked.

> Note: per-body `friction`/`restitution` and spawn `rotation` on `Body3DDef`,
> which the example also uses, were **already in `main`** — they are NOT part of
> this branch and need no review.

---

## 2. Example design that used them (regional wake/sleep + fan fluidise)

All of this lived in `src/utilities/FactoryOperations.ts`. It is removed in the
main-compatible version; this is the verbatim record for restoration.

### State

```ts
/** Per-body wake windows: bodyId → seconds of physics still owed. Only these
 * bodies get the gravity-correction (+ swirl) force, so everything else sleeps
 * and never jitters. */
private readonly _active = new Map<BodyId, number>();
/** True while the fan has temporarily lowered item↔item friction. */
private _fanFrictionOn = false;
```

### Wake helpers

```ts
private _wakeBody(id: BodyId, seconds: number): void {
  if (seconds > (this._active.get(id) ?? 0)) this._active.set(id, seconds);
  this._physics!.wakeUp(id);
}
private _wakeAll(seconds: number): void {
  for (const id of this._pile.keys()) this._wakeBody(id, seconds);
}
/** Zero velocity (lin+ang) THEN sleep — cannon keeps velocity through sleep, so
 * zeroing first stops a body resuming stale velocity when re-woken. */
private _freeze(id: BodyId): void {
  this._physics!.setVelocity(id, 0, 0, 0);
  this._physics!.setAngularVelocity(id, 0, 0, 0);
  this._physics!.sleep(id);
}
private _sleepAll(): void {
  for (const id of this._pile.keys()) this._freeze(id);
}
/** Wake the pile bodies a vertical cylinder touches (radius pickWake.radius around
 * (cx,cz), base at cy rising pickWake.height). */
private _wakeColumn(cx: number, cy: number, cz: number, seconds: number): void {
  const pw = this._config!.pickWake;
  const r2 = pw.radius * pw.radius;
  const yMin = cy, yMax = cy + pw.height;
  const hits: { id: BodyId; d2: number }[] = [];
  for (const id of this._pile.keys()) {
    const t = this._physics!.getTransform(id, this._t);
    if (t.y < yMin || t.y > yMax) continue;
    const dx = t.x - cx, dz = t.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) hits.push({ id, d2 });
  }
  if (pw.max > 0 && hits.length > pw.max) { hits.sort((a, b) => a.d2 - b.d2); hits.length = pw.max; }
  for (const h of hits) this._wakeBody(h.id, seconds);
}
```

### Per-frame processing (inside `update`)

```ts
// Burn down per-body wake windows; freeze a body when its window ends; when the
// last window ends, sleep the WHOLE pile (catches collision-woken stragglers).
const hadActive = this._active.size > 0;
for (const [id, left] of this._active) {
  const next = left - dt;
  if (next > 0 && this._pile.has(id)) this._active.set(id, next);
  else { this._active.delete(id); if (this._pile.has(id)) this._freeze(id); }
}
if (hadActive && this._active.size === 0) this._sleepAll();
// Strict containment: force any pile body NOT in the wake set back to sleep each
// frame, so collision-woken neighbours can't spread motion past the wake region.
if (this._active.size > 0) {
  for (const id of this._pile.keys()) if (!this._active.has(id)) this._freeze(id);
}
```

…and the gravity-correction branch (only active bodies, so idle ones stay asleep):

```ts
} else {
  const dg = phys.gravityAfterStart - phys.gravity;
  if (dg !== 0) for (const id of this._active.keys()) this._physics!.applyForce(id, 0, dg, 0);
}
```

### Fan fluidise

```ts
private _triggerSwirl(): void {
  const fan = this._config!.fan;
  this._swirl = fan.duration;
  this._wakeAll(fan.duration + fan.settleAfter);
  this._physics!.setDefaultFriction(fan.friction);   // drop friction so the pile fluidises
  this._fanFrictionOn = true;
}
// …and at the end of update(), once the swirl ends:
if (this._fanFrictionOn && this._swirl <= 0) {
  this._physics!.setDefaultFriction(this._config!.physics.friction);  // restore
  this._fanFrictionOn = false;
}
```

The wake/gravity/fan loop iterated `this._active.keys()`; calls to `_wakeColumn`
seeded the window after picks (`physics.settleSeconds`), the spring drop
(`spring.settle`), and the initial build / fan (`_wakeAll`,
`physics.initialSettleSeconds` / `fan.duration + fan.settleAfter`).

The app gated the world step on this system:
`FactoryMatchApp.postInitialize` → `if (ops.physicsActive) physics.step(dt)`, where
`physicsActive` was `this._active.size > 0`.

---

## 3. Main-compatible version (what the example does now)

The example no longer calls `sleep` / `wakeUp` / `setDefaultFriction`. Instead it
leans on what `main` already provides:

- **Auto-sleep** (`allowSleep` defaults to `true` in `Physics3DManager`): idle
  bodies sleep on their own and are skipped by the solver — the anti-jitter we
  previously forced.
- **`setVelocity` wakes a body** (the manager calls `body.wakeUp()` inside
  `setVelocity`/`setAngularVelocity`/`applyForce`/`applyImpulse`). So a pick wakes
  the stack above the gap with `setVelocity(id, 0, 0, 0)` (the cylinder query in
  `_wakeColumn` is kept; only the wake call changed from `wakeUp` to `setVelocity`).
- The world steps every frame while a pile exists (`physicsActive = _pile.size > 0`);
  sleeping bodies make that cheap.
- The fan still works: it's velocity-driven (sets each item's velocity along the
  spiral field every frame, which also wakes them), so it never needed friction to
  function — only the extra "fluid" feel.

### Behaviour trade-offs vs the framework version (re-tune target for later)

- **No forced regional sleep / strict containment.** A collision-woken neighbour
  now simulates until auto-sleep catches it, instead of being re-frozen the same
  frame. Slightly more motion can spread from a pick; auto-sleep still settles it.
- **Gravity softening after start is gone.** `physics.gravityAfterStart` (-4.82)
  was applied as a per-body correction force to *awake* bodies only; on `main`
  there's no way to apply it without waking the whole pile every frame (which
  would defeat auto-sleep). The pile now uses a single world gravity
  (`physics.gravity`, -9.82) throughout. Picks resettle a touch faster/harder.
- **Fan no longer drops friction.** The swirl still runs (velocity-driven); the
  pile is marginally less "fluid" at the edges during the spin.

### Config fields now dormant (kept for the restore path, currently unused)

`physics.gravityAfterStart`, `physics.settleSeconds`, `physics.initialSettleSeconds`,
`fan.settleAfter`, `fan.friction`. `pickWake.*` is still used (the wake-column query).

---

## 4. How to restore the full system

1. Land `feat/physics3d-sleep-wake` on `gamelabs.js` `main` (maintainer review),
   rebuild the framework dist.
2. Re-add the state + helpers + per-frame processing + fan fluidise from section 2
   into `FactoryOperations.ts`, and restore `physicsActive = _active.size > 0`.
3. The dormant config fields in section 3 drive it again — no config changes needed.
