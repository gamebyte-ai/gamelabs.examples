import "./style.css";
import "@pixi/layout";

import { UIPlaygroundApp } from "./UIPlaygroundApp.js";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new UIPlaygroundApp(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch((err) => console.error("App failed:", err));
});
