import * as PIXI from "pixi.js";
import gsap from "gsap";
import { HudViewBase, type IInstanceResolver, type Unsubscribe } from "@gamebyte/gamelabsjs";
import type { IEndView } from "./IEndView";
import { SortExpressConfig } from "../SortExpressConfig";
import { SortExpressAssetIds } from "../SortExpressAssetIds";

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

/**
 * End card. A scrim over the (still-visible) board, then a placeholder rounded
 * app icon, the game name and a pulsing "İNDİR" button. Tapping the button — or
 * anywhere on the card — fires {@link onDownload} (wired to the store). Fully
 * procedural (no assets); real art replaces the icon later.
 */
export class EndView extends HudViewBase implements IEndView {
  private _config: SortExpressConfig | null = null;
  private _scrim: PIXI.Graphics | null = null;
  private _icon: PIXI.Sprite | null = null;
  private _iconMask: PIXI.Graphics | null = null;
  private _iconPlaceholder: PIXI.Graphics | null = null;
  private _gameName: PIXI.Text | null = null;
  private _download: PIXI.Container | null = null;
  private _downloadBg: PIXI.Graphics | null = null;
  private _downloadLabel: PIXI.Text | null = null;
  private _entrance: gsap.core.Timeline | null = null;
  private readonly _downloadListeners = new Set<() => void>();
  private _safe = { x: 0, y: 0, w: 0, h: 0 };
  private _full = { w: 0, h: 0 };

  public override inject(resolver: IInstanceResolver): void {
    super.inject(resolver);
    this._config = resolver.getInstance(SortExpressConfig);
  }

  public override postInitialize(): void {
    super.postInitialize();
    this.visible = false;

    // Scrim over the still-visible board — eats taps + a tap anywhere → store.
    this._scrim = new PIXI.Graphics({ eventMode: "static", cursor: "pointer" });
    this._scrim.on("pointertap", () => this._emitDownload());

    // App icon: the loaded thumbnail texture masked to a rounded square, with a
    // rounded-square colour placeholder behind it (shows if the texture is absent).
    this._iconPlaceholder = new PIXI.Graphics();
    this._iconPlaceholder.eventMode = "none";
    const tex = this.assetLoader.getAsset<PIXI.Texture>(SortExpressAssetIds.AppIcon);
    this._icon = new PIXI.Sprite(tex ?? PIXI.Texture.EMPTY);
    this._icon.anchor.set(0.5);
    this._icon.eventMode = "none";
    this._icon.visible = !!tex;
    this._iconMask = new PIXI.Graphics();
    this._icon.mask = this._iconMask;

    const e = this._config!.end;
    this._gameName = new PIXI.Text({
      text: e.gameName,
      style: { fill: e.gameNameColor, fontSize: e.gameNameFontSize, fontWeight: "900", fontFamily: FONT, align: "center" },
    });
    this._gameName.anchor.set(0.5);
    this._gameName.eventMode = "none";

    // Download button — its own container so the pulse scale is size-independent.
    this._download = new PIXI.Container();
    this._downloadBg = new PIXI.Graphics({ eventMode: "static", cursor: "pointer" });
    this._downloadBg.on("pointertap", () => this._emitDownload());
    this._downloadLabel = new PIXI.Text({
      text: e.downloadText,
      style: { fill: e.downloadTextColor, fontSize: e.downloadFontSize, fontWeight: "900", fontFamily: FONT },
    });
    this._downloadLabel.anchor.set(0.5);
    this._downloadLabel.eventMode = "none";
    this._download.addChild(this._downloadBg, this._downloadLabel);

    this.addChild(this._scrim, this._iconPlaceholder, this._icon, this._iconMask, this._gameName, this._download);
  }

  public onDownload(cb: () => void): Unsubscribe {
    this._downloadListeners.add(cb);
    return () => this._downloadListeners.delete(cb);
  }

  private _emitDownload(): void {
    for (const cb of this._downloadListeners) cb();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this._playEntrance();
    else this._stopEntrance();
  }

  public setLayout(safeX: number, safeY: number, safeW: number, safeH: number, fullW: number, fullH: number): void {
    this._safe = { x: safeX, y: safeY, w: safeW, h: safeH };
    this._full = { w: fullW, h: fullH };
    this._relayout();
  }

  private _relayout(): void {
    if (!this._config || this._safe.w === 0) return;
    const e = this._config.end;
    const { x: sx, y: sy, w: sw, h: sh } = this._safe;
    const s = sw / e.referenceWidth;
    const cx = sx + sw / 2;

    // Scrim covers the WHOLE canvas (light → the board stays visible).
    this._scrim?.clear().rect(0, 0, this._full.w, this._full.h).fill({ color: e.scrimColor, alpha: e.scrimAlpha });

    // App icon (thumbnail texture masked to a rounded square; colour placeholder
    // behind it for when the texture is missing).
    const iconW = sw * e.iconWidthFraction;
    const icy = sy + sh * e.iconCenterYFraction;
    const round = iconW * e.iconCornerFraction;
    this._iconPlaceholder
      ?.clear()
      .roundRect(cx - iconW / 2, icy - iconW / 2, iconW, iconW, round)
      .fill({ color: e.iconColor });
    this._iconMask?.clear().roundRect(cx - iconW / 2, icy - iconW / 2, iconW, iconW, round).fill(0xffffff);
    if (this._icon && this._icon.texture.width > 0) {
      const t = this._icon.texture;
      this._icon.scale.set(Math.max(iconW / t.width, iconW / t.height)); // cover
      this._icon.position.set(cx, icy);
    }

    // Game name.
    if (this._gameName) {
      this._gameName.style.fontSize = e.gameNameFontSize * s;
      this._gameName.style.stroke = { color: e.gameNameStrokeColor, width: sw * 0.008 };
      this._gameName.style.padding = e.gameNameFontSize * s * 0.4; // texture margin (avoid clip)
      this._gameName.position.set(cx, sy + sh * e.gameNameCenterYFraction);
    }

    // Download pill (centered on its container so the pulse scales about center).
    if (this._download && this._downloadBg && this._downloadLabel) {
      const bw = sw * e.downloadWidthFraction;
      const bh = sh * e.downloadHeightFraction;
      this._downloadBg.clear().roundRect(-bw / 2, -bh / 2, bw, bh, bh * e.downloadCornerFraction).fill(e.downloadFill);
      this._downloadLabel.style.fontSize = e.downloadFontSize * s;
      this._downloadLabel.style.padding = e.downloadFontSize * s * 0.4;
      this._download.position.set(cx, sy + sh * e.downloadCenterYFraction);
    }
  }

  /** Fade the whole card in after a short delay, then pulse the download button. */
  private _playEntrance(): void {
    const e = this._config!.end;
    this._stopEntrance();
    this.alpha = 0;
    this._entrance = gsap
      .timeline({ delay: e.fadeDelaySeconds })
      .to(this, { alpha: 1, duration: e.fadeSeconds })
      .add(() => this._startPulse());
  }

  private _stopEntrance(): void {
    this._entrance?.kill();
    this._entrance = null;
    if (this._download) gsap.killTweensOf(this._download.scale);
  }

  private _startPulse(): void {
    if (!this._download || !this._config) return;
    const e = this._config.end;
    gsap.killTweensOf(this._download.scale);
    gsap.to(this._download.scale, { x: e.pulseScale, y: e.pulseScale, duration: e.pulseSeconds, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  public override preDestroy(): void {
    this._stopEntrance();
    this._downloadListeners.clear();
    for (const o of [this._scrim, this._icon, this._iconMask, this._iconPlaceholder, this._gameName, this._download])
      o?.destroy({ children: true });
    this._scrim = null;
    this._icon = null;
    this._iconMask = null;
    this._iconPlaceholder = null;
    this._gameName = null;
    this._download = null;
    this._downloadBg = null;
    this._downloadLabel = null;
    this._config = null;
  }
}
