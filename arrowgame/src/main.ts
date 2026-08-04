import "./style.css"; // sizing CSS — bundled so it survives the playable build's index.html swap
import { ArrowGameApp } from "./ArrowGameApp";

// Bootstrap the Arrow Nudge Escape game. Wrapped in an async function (NO
// top-level await) so the playable build's IIFE output format accepts it.
async function start(): Promise<void> {
  const app = new ArrowGameApp(document.getElementById("stage")!);
  await app.initialize();
  app.mainLoop();
  app.informHost({ type: "ready" }); // 4.2.0 host-comm: signal the ad host we're ready
}

start().catch((err) => console.error("App failed:", err));
