import "./style.css";
import "@pixi/layout";

import { Game2048App } from "./Game2048App.js";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new Game2048App(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch(err => console.error("App failed:", err));
});
