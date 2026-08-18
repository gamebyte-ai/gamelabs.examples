import "./style.css";
import "@pixi/layout";

import { SortExpressApp } from "./SortExpressApp";

/** Block native scroll/zoom outside the canvas (iOS Safari ignores the viewport
 * `user-scalable=no`, so guard pinch + double-tap zoom in JS too). */
function lockViewportGestures(): void {
  const prevent = (e: Event): void => e.preventDefault();
  // Safari pinch-zoom gestures.
  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });
  // Multi-touch moves (pinch) and rubber-band scrolling.
  document.addEventListener(
    "touchmove",
    (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  // Double-tap to zoom.
  let lastTouch = 0;
  document.addEventListener(
    "touchend",
    (e: TouchEvent) => {
      const now = e.timeStamp;
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    },
    { passive: false },
  );
}

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new SortExpressApp(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  lockViewportGestures();
  start().catch((err) => console.error("App failed:", err));
});
