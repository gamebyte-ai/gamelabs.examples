import * as PIXI from "pixi.js";
import gsap from "gsap";
import { ScreenView, type IInstanceResolver } from "@gamebyte/gamelabsjs";
import type { IHudView } from "./IHudView";
import { SortExpressConfig } from "../SortExpressConfig";
import { EndView } from "./EndView.pixi";

/**
 * Gameplay HUD: a centred top-of-screen countdown timer chip (rounded pill with
 * a coloured border, dark inner panel, top tab, and MM:SS text) over a
 * transparent backdrop. NON-INTERACTIVE (`eventMode = "none"`) so pointer events
 * fall through to the 3D board beneath — the board stays draggable.
 *
 * Placeholder vector art; swap for a textured asset later without touching the
 * controller (it only calls {@link setTime}).
 */
export class HudView extends ScreenView implements IHudView {
  private _config: SortExpressConfig | null = null;
  private readonly _chip = new PIXI.Graphics();
  private _label: PIXI.Text | null = null;
  private _banner: PIXI.Text | null = null;
  private readonly _broom = new PIXI.Graphics();
  private readonly _shuffle = new PIXI.Graphics(); // shuffle button BACKGROUND (stays)
  private readonly _shuffleIcon = new PIXI.Graphics(); // the hat ICON (travels to centre)
  private _shuffleCountText: PIXI.Text | null = null;
  private _shuffleRemaining = 0;
  private _shuffleCenter = { x: 0, y: 0 }; // the hat button's resting screen centre
  private _shuffleTl: gsap.core.Timeline | null = null;
  private readonly _boosterSlots = new PIXI.Graphics(); // empty placeholder buttons
  private _broomCount: PIXI.Text | null = null;
  private _broomRemaining = 0;
  private _broomCenter = { x: 0, y: 0 }; // broom button's screen centre (px)
  private readonly _broomListeners = new Set<() => void>();
  private readonly _shuffleListeners = new Set<() => void>();
  private _end: EndView | null = null;
  private _w = 0;
  private _h = 0;
  private _seconds = 0;
  private _fraction = 1;
  private _low = false;
  private _bannerVisible = false;

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(SortExpressConfig);
  }

  public override postInitialize(): void {
    // "passive": the view itself isn't hit-tested (taps pass through to the World
    // below), but interactive children (the broom button) still receive events.
    this.eventMode = "passive";
    this._chip.eventMode = "none";
    this.addChild(this._chip);
    this._label = new PIXI.Text({
      text: "0:00",
      style: {
        fill: this._config!.countdown.textColor,
        fontSize: 30,
        fontWeight: "900",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._label.anchor.set(0.5);
    this.addChild(this._label);
    this._banner = new PIXI.Text({
      text: this._config!.countdown.timeoutText,
      style: {
        fill: this._config!.countdown.lowColor,
        fontSize: this._config!.countdown.timeoutFontSize,
        fontWeight: "900",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._banner.anchor.set(0.5);
    this._banner.eventMode = "none";
    this._banner.visible = false;
    this.addChild(this._banner);
    // Empty placeholder booster buttons (behind the others; no function).
    this._boosterSlots.eventMode = "none";
    this.addChild(this._boosterSlots);
    // Shuffle booster: the BACKGROUND circle is the (interactive) button + count
    // badge and stays put; the hat ICON is a separate object that travels to the
    // centre during the shuffle.
    this._shuffle.eventMode = "static";
    this._shuffle.cursor = "pointer";
    this._shuffle.on("pointertap", () => {
      if (this._shuffleRemaining <= 0) return; // depleted
      for (const cb of this._shuffleListeners) cb();
    });
    this.addChild(this._shuffle);
    this._shuffleIcon.eventMode = "none";
    this.addChild(this._shuffleIcon);
    this._shuffleCountText = new PIXI.Text({
      text: String(this._config!.booster.shuffle.count),
      style: {
        fill: this._config!.booster.count.textColor,
        fontSize: 20,
        fontWeight: "900",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._shuffleCountText.anchor.set(0.5);
    this._shuffleCountText.eventMode = "none";
    this.addChild(this._shuffleCountText);
    this._shuffleRemaining = this._config!.booster.shuffle.count;
    // Broom booster button — interactive; taps fire the broom listeners.
    this._broom.eventMode = "static";
    this._broom.cursor = "pointer";
    this._broom.on("pointertap", () => {
      if (this._broomRemaining <= 0) return; // depleted
      for (const cb of this._broomListeners) cb();
    });
    this.addChild(this._broom);
    // Remaining-count badge (drawn by _drawBroom; text is a child on top).
    this._broomCount = new PIXI.Text({
      text: String(this._config!.booster.count.count),
      style: {
        fill: this._config!.booster.count.textColor,
        fontSize: 20,
        fontWeight: "900",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        align: "center",
      },
    });
    this._broomCount.anchor.set(0.5);
    this._broomCount.eventMode = "none";
    this.addChild(this._broomCount);
    this._broomRemaining = this._config!.booster.count.count;
    // End card (CTA) as a child on top, hidden until the game ends.
    this._end = this.viewFactory.createView(EndView);
    this.addChild(this._end);
    // Build children first, THEN let the base fire its initial onResize → render.
    super.postInitialize();
  }

  public showEndCard(): void {
    this._end?.setVisible(true);
  }

  public onBroom(cb: () => void): () => void {
    this._broomListeners.add(cb);
    return () => this._broomListeners.delete(cb);
  }

  /** The broom button's centre in screen NDC (x,y ∈ [-1,1]) — the board unprojects
   * it so the vacuumed items fly to exactly under the button. */
  public broomScreenNdc(): { x: number; y: number } {
    if (this._w === 0 || this._h === 0) return { x: 0, y: -0.9 };
    return { x: (this._broomCenter.x / this._w) * 2 - 1, y: 1 - (this._broomCenter.y / this._h) * 2 };
  }

  public onShuffle(cb: () => void): () => void {
    this._shuffleListeners.add(cb);
    return () => this._shuffleListeners.delete(cb);
  }

  public setShuffleCount(count: number): void {
    this._shuffleRemaining = Math.max(0, count);
    const usable = this._shuffleRemaining > 0;
    this._shuffle.eventMode = usable ? "static" : "none";
    this._shuffle.cursor = usable ? "pointer" : "default";
    this._shuffle.alpha = usable ? 1 : 0.5;
    this._shuffleIcon.alpha = usable ? 1 : 0.5;
    this._render();
  }

  /** Animate the hat button to the SCREEN CENTRE (over the board), hold there while
   * the items gather + spin, then return it to its slot — timed to the board's
   * shuffle choreography (config `shuffleAnim`). */
  public playShuffle(ndc: { x: number; y: number }): void {
    const a = this._config!.booster.shuffleAnim;
    // NDC (x,y ∈ [-1,1], y up) → HUD screen pixels (y down). The hat graphic is
    // centred on its origin, so its position IS its centre — move it there directly.
    const targetX = (ndc.x * 0.5 + 0.5) * this._w;
    const targetY = (-ndc.y * 0.5 + 0.5) * this._h;
    // Only the ICON travels to the centre; the button background stays in its slot.
    const rest = { x: this._shuffleCenter.x, y: this._shuffleCenter.y };
    this._shuffleTl?.kill();
    this._shuffleIcon.position.set(rest.x, rest.y);
    this._shuffleIcon.scale.set(1);
    // Stay BRIGHT for the whole animation even if this was the last use — the
    // depleted (dim) look is applied only once it returns (onComplete).
    this._shuffleIcon.alpha = 1;
    this._shuffle.alpha = 1;
    this._shuffleTl = gsap.timeline({
      onComplete: () => {
        this._shuffleTl = null;
        this._shuffleIcon.position.set(rest.x, rest.y);
        this._shuffleIcon.scale.set(1);
        this.setShuffleCount(this._shuffleRemaining); // now apply the depleted look
      },
    });
    // Icon slides to the centre CONCURRENTLY with the items, holds during the free
    // swirl, then SQUASHES DOWN over the suck (synced with the items being pulled
    // in), POPS UP as they're distributed out — then returns to the button.
    const bu = a.burst;
    const holdBeforeSuck = Math.max(0, a.popStagger + a.spin.seconds - a.hatInSeconds);
    this._shuffleTl
      .to(this._shuffleIcon.position, { x: targetX, y: targetY, duration: a.hatInSeconds, ease: "power2.inOut" }, 0)
      .to(this._shuffleIcon.scale, { x: 1.4, y: 1.4, duration: a.hatInSeconds, ease: "power2.out" }, 0)
      .to({}, { duration: holdBeforeSuck })
      .to(this._shuffleIcon.scale, { x: bu.downScale, y: bu.downScale, duration: a.spin.pullInSeconds, ease: "power2.inOut" })
      .to(this._shuffleIcon.scale, { x: bu.upScale, y: bu.upScale, duration: bu.upSeconds, ease: "back.out(2.5)" })
      .to(this._shuffleIcon.position, { x: rest.x, y: rest.y, duration: a.scatterSeconds, ease: "power2.inOut" })
      .to(this._shuffleIcon.scale, { x: 1, y: 1, duration: a.scatterSeconds, ease: "power2.inOut" }, "<");
  }

  public setBroomCount(count: number): void {
    this._broomRemaining = Math.max(0, count);
    const usable = this._broomRemaining > 0;
    this._broom.eventMode = usable ? "static" : "none";
    this._broom.cursor = usable ? "pointer" : "default";
    this._broom.alpha = usable ? 1 : 0.5; // greyed-out when depleted
    this._render();
  }

  public showTimeout(): void {
    const c = this._config!.countdown;
    this._showBanner(c.timeoutText, c.lowColor);
  }

  public showWin(): void {
    const c = this._config!.countdown;
    this._showBanner(c.winText, c.winColor);
  }

  private _showBanner(text: string, color: number): void {
    if (this._banner) {
      this._banner.text = text;
      this._banner.style.fill = color;
    }
    this._bannerVisible = true;
    this._render();
  }

  public setTime(remainingSeconds: number, fraction01: number): void {
    this._seconds = Math.max(0, remainingSeconds);
    this._fraction = Math.max(0, Math.min(1, fraction01));
    this._low = this._fraction <= this._config!.countdown.lowThreshold;
    this._render();
  }

  public override onResize(width: number, height: number, dpr: number): void {
    super.onResize(width, height, dpr);
    this._w = width;
    this._h = height;
    this._render();
    const r = this._rect();
    this._end?.setLayout(r.x, r.y, r.w, r.h, width, height);
  }

  /** Centred play-rect of `gameplayAspect` + the px→rect scale, so the chip tracks
   * the gameplay area like the rest of the UI. */
  private _rect(): { x: number; y: number; w: number; h: number; scale: number } {
    const cfg = this._config!;
    const rw = Math.min(this._w, this._h * cfg.gameplayAspect);
    const rh = rw / cfg.gameplayAspect;
    return { x: (this._w - rw) / 2, y: (this._h - rh) / 2, w: rw, h: rh, scale: rw / cfg.referenceWidth };
  }

  /** Format seconds as M:SS (rounded UP so the last second shows before hitting 0). */
  private _fmt(s: number): string {
    const t = Math.ceil(s);
    const m = Math.floor(t / 60);
    const sec = t % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  private _render(): void {
    if (!this._config || this._w === 0 || this._h === 0 || !this._label) return;
    const c = this._config.countdown;
    const r = this._rect();
    const w = c.width * r.scale;
    const h = c.height * r.scale;
    const rad = c.radius * r.scale;
    const bw = c.borderWidth * r.scale;
    // Pin to the SCREEN top-centre (not the play-rect, whose vertical letterbox
    // margin would drift the chip as the window ratio changes).
    const cx = this._w / 2;
    const cy = this._h * c.topFraction;
    const accent = this._low ? c.lowColor : c.borderColor;

    const x = cx - w / 2;
    const y = cy - h / 2;
    this._chip.clear();

    // Dark inner panel (inset by the border so the ring sits around it).
    this._chip
      .roundRect(x + bw, y + bw, w - 2 * bw, h - 2 * bw, Math.max(0, rad - bw))
      .fill({ color: c.innerColor });

    // The progress RING runs along the pill's rounded-rect perimeter (centred in
    // the border band), starting at top-centre and DEPLETING clockwise as time
    // runs out. A faint full-perimeter track shows the elapsed part.
    const pts = this._pillPerimeter(x + bw / 2, y + bw / 2, w - bw, h - bw, Math.max(0, rad - bw / 2));
    this._strokeRange(pts, 0, 1, bw, c.trackColor, c.trackAlpha);
    // Remaining green is the TAIL of the loop, so the empty front advances
    // CLOCKWISE from the top-centre start as time runs out.
    this._strokeRange(pts, 1 - this._fraction, 1, bw, accent, 1);

    // Optional accent tab at the top-centre (the ring's start point).
    if (c.showTab) {
      const tw = w * 0.22;
      const th = h * 0.42;
      this._chip.roundRect(cx - tw / 2, y - th * 0.55, tw, th, th * 0.35).fill({ color: accent });
    }

    this._label.text = this._fmt(this._seconds);
    this._label.style.fill = c.textColor;
    this._label.style.fontSize = c.fontSize * r.scale;
    this._label.position.set(cx, cy);

    if (this._banner) {
      this._banner.visible = this._bannerVisible;
      this._banner.style.fontSize = c.timeoutFontSize * r.scale;
      this._banner.position.set(this._w / 2, this._h / 2);
    }

    this._drawBroom(r.scale);
  }

  /** Round placeholder booster button (art comes later) near the bottom of the
   * screen; a simple bristle icon marks it as the broom. */
  private _drawBroom(scale: number): void {
    const b = this._config!.booster.broom;
    const sh = this._config!.booster.shuffle;
    const ph = this._config!.booster.placeholders;
    const rad = b.radius * b.scale * scale;
    const by = this._h * b.bottomFraction;
    // Row: [broom, shuffle, ...placeholders] centred at `centerFraction`.
    const step = 2 * rad + rad * ph.gapFraction;
    const total = 2 + Math.max(0, ph.count);
    const rowStart = this._w * b.centerFraction - ((total - 1) * step) / 2; // centre of first button
    const bx = rowStart; // broom = slot 0
    const shx = rowStart + step; // shuffle = slot 1
    this._shuffleCenter = { x: shx, y: by };
    this._broomCenter = { x: bx, y: by };

    // Shuffle button BACKGROUND (purple circle) — stays in its slot; interactive.
    this._shuffle.clear();
    this._shuffle.position.set(shx, by);
    this._shuffle
      .circle(0, 0, rad)
      .fill({ color: sh.color })
      .circle(0, 0, rad)
      .stroke({ width: Math.max(2, rad * 0.12), color: 0x000000, alpha: 0.25 });
    this._shuffle.hitArea = new PIXI.Circle(0, 0, rad);
    // Count badge on the background (same style as the broom's).
    const scc = this._config!.booster.count;
    const sBadgeR = rad * scc.radiusFraction;
    const sbx = rad * scc.offsetXFraction;
    const sby = rad * scc.offsetYFraction;
    this._shuffle
      .circle(sbx, sby, sBadgeR)
      .fill({ color: scc.color })
      .circle(sbx, sby, sBadgeR)
      .stroke({ width: Math.max(1.5, sBadgeR * 0.14), color: 0xffffff, alpha: 0.9 });
    if (this._shuffleCountText) {
      this._shuffleCountText.text = String(this._shuffleRemaining);
      this._shuffleCountText.style.fontSize = rad * scc.fontFraction;
      this._shuffleCountText.style.fill = scc.textColor;
      this._shuffleCountText.position.set(shx + sbx, by + sby);
    }
    // Hat ICON (brim + cone), centred on its own origin so scaling grows about the
    // centre; positioned at the button, travels to the centre in playShuffle.
    this._shuffleIcon.clear();
    this._shuffleIcon
      .roundRect(-rad * 0.5, rad * 0.12, rad, rad * 0.22, rad * 0.1)
      .fill({ color: sh.iconColor })
      .moveTo(-rad * 0.34, rad * 0.16)
      .lineTo(0, -rad * 0.5)
      .lineTo(rad * 0.34, rad * 0.16)
      .fill({ color: sh.iconColor });
    if (!this._shuffleTl) this._shuffleIcon.position.set(shx, by); // don't fight an active anim

    // Placeholder buttons (empty, different colour) at slots 2..N.
    this._boosterSlots.clear();
    for (let i = 2; i < total; i++) {
      const px = rowStart + i * step;
      this._boosterSlots
        .circle(px, by, rad)
        .fill({ color: ph.color })
        .circle(px, by, rad)
        .stroke({ width: Math.max(2, rad * 0.12), color: 0x000000, alpha: 0.25 });
    }

    this._broom.clear();
    this._broom.position.set(0, 0);
    this._broom
      .circle(bx, by, rad)
      .fill({ color: b.color })
      .circle(bx, by, rad)
      .stroke({ width: Math.max(2, rad * 0.12), color: 0x000000, alpha: 0.25 });
    // Placeholder "broom" mark: a short handle + a bristle base.
    const hw = rad * 0.16;
    this._broom
      .roundRect(bx - hw / 2, by - rad * 0.5, hw, rad * 0.7, hw / 2)
      .fill({ color: b.iconColor })
      .roundRect(bx - rad * 0.42, by + rad * 0.12, rad * 0.84, rad * 0.36, rad * 0.1)
      .fill({ color: b.iconColor });
    // Keep the circular button a clean tap target.
    this._broom.hitArea = new PIXI.Circle(bx, by, rad);

    // Remaining-count badge: a red circle at the lower edge of the button, count
    // inside. Drawn on the broom graphics; the count text sits on top.
    const cc = this._config!.booster.count;
    const badgeR = rad * cc.radiusFraction;
    const cx = bx + rad * cc.offsetXFraction;
    const cy = by + rad * cc.offsetYFraction;
    this._broom
      .circle(cx, cy, badgeR)
      .fill({ color: cc.color })
      .circle(cx, cy, badgeR)
      .stroke({ width: Math.max(1.5, badgeR * 0.14), color: 0xffffff, alpha: 0.9 });
    if (this._broomCount) {
      this._broomCount.text = String(this._broomRemaining);
      this._broomCount.style.fontSize = rad * cc.fontFraction;
      this._broomCount.style.fill = cc.textColor;
      this._broomCount.position.set(cx, cy);
    }
  }

  /** Ordered points around a rounded-rect perimeter, starting at TOP-CENTRE and
   * going clockwise (corners sampled into arc segments). */
  private _pillPerimeter(rx: number, ry: number, rw: number, rh: number, rr: number): Array<[number, number]> {
    const cx = rx + rw / 2;
    const pts: Array<[number, number]> = [];
    const arc = (ccx: number, ccy: number, a0: number, a1: number): void => {
      const seg = 8;
      for (let i = 0; i <= seg; i++) {
        const a = ((a0 + (a1 - a0) * (i / seg)) * Math.PI) / 180;
        pts.push([ccx + rr * Math.cos(a), ccy + rr * Math.sin(a)]);
      }
    };
    pts.push([cx, ry]); // top centre (start)
    pts.push([rx + rw - rr, ry]);
    arc(rx + rw - rr, ry + rr, 270, 360); // top-right
    pts.push([rx + rw, ry + rh - rr]);
    arc(rx + rw - rr, ry + rh - rr, 0, 90); // bottom-right
    pts.push([rx + rr, ry + rh]);
    arc(rx + rr, ry + rh - rr, 90, 180); // bottom-left
    pts.push([rx, ry + rr]);
    arc(rx + rr, ry + rr, 180, 270); // top-left
    pts.push([cx, ry]); // back to start
    return pts;
  }

  /** Stroke the sub-arc of a polyline between normalized positions `from01`..`to01`
   * (0 = top-centre start, increasing clockwise) onto _chip. */
  private _strokeRange(pts: Array<[number, number]>, from01: number, to01: number, width: number, color: number, alpha: number): void {
    const a = Math.max(0, Math.min(1, from01));
    const b = Math.max(0, Math.min(1, to01));
    if (b - a <= 0 || pts.length < 2) return;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const dStart = total * a;
    const dEnd = total * b;
    const g = this._chip;
    const lerp = (p0: [number, number], p1: [number, number], t: number): [number, number] => [
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
    ];
    let acc = 0;
    let started = false;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (seg === 0) continue;
      const segStart = acc;
      const segEnd = acc + seg;
      acc = segEnd;
      if (segEnd < dStart) continue; // before the range
      if (segStart > dEnd) break; // past the range
      if (!started) {
        const t0 = Math.max(0, (dStart - segStart) / seg);
        const e = lerp(p0, p1, t0);
        g.moveTo(e[0], e[1]);
        started = true;
      }
      if (segEnd <= dEnd) {
        g.lineTo(p1[0], p1[1]);
      } else {
        const t1 = (dEnd - segStart) / seg;
        const e = lerp(p0, p1, t1);
        g.lineTo(e[0], e[1]);
        break;
      }
    }
    if (started) g.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  public override preDestroy(): void {
    super.preDestroy();
    this._chip.destroy();
    this._label?.destroy();
    this._label = null;
    this._banner?.destroy();
    this._banner = null;
    this._broomListeners.clear();
    this._shuffleListeners.clear();
    this._shuffleTl?.kill();
    this._shuffleTl = null;
    this._broom.destroy();
    this._shuffle.destroy();
    this._shuffleIcon.destroy();
    this._shuffleCountText?.destroy();
    this._shuffleCountText = null;
    this._boosterSlots.destroy();
    this._broomCount?.destroy();
    this._broomCount = null;
    this._end?.destroy();
    this._end = null;
    this._config = null;
  }
}
