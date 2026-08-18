import "./style.css";
import "@pixi/layout";

import { MergeGameApp } from "./MergeGameApp";

/** Block the browser context menu (right-click / long-press) so it never
 * interrupts aiming or dragging. */
function suppressContextMenu(): void {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new MergeGameApp(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  suppressContextMenu();
  start().catch((err) => console.error("App failed:", err));
});
