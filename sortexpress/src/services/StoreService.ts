/**
 * Opens external store links — the app-store CTA on the end screen. Isolated
 * here (not in a controller) because it touches a browser API that can fail on
 * the environment (popup blockers), per the services boundary rule.
 */
export class StoreService {
  /** Open the platform-appropriate store URL: Google Play on Android, the iOS
   * App Store link otherwise (iOS devices + desktop fallback). */
  public openStore(urls: { ios: string; android: string }): void {
    this.open(this._isAndroid() ? urls.android : urls.ios);
  }

  /** Open the given store URL in a new tab/window. */
  public open(url: string): void {
    if (typeof window !== "undefined") window.open(url, "_blank");
  }

  /** Whether the current device is Android (otherwise treated as iOS/desktop). */
  private _isAndroid(): boolean {
    if (typeof navigator === "undefined") return false;
    return /android/i.test(navigator.userAgent);
  }
}
