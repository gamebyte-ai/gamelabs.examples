import "./style.css";
import "@pixi/layout";

import { Match3App } from "./Match3App.js";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new Match3App(stage);
  await app.initialize();
  app.mainLoop();
  // Host-comm: impression signal for playable-ad / portal hosts. The framework
  // auto-fires `interaction` on the first pointer, so this is the only manual
  // event an endless board needs.
  app.informHost({ type: "ready" });
}

window.addEventListener("load", () => {
  start().catch(err => console.error("App failed:", err));
});
