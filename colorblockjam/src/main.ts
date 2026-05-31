import "./style.css";
import "@pixi/layout";

import { ColorBlockJamApp } from "./ColorBlockJamApp.js";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new ColorBlockJamApp(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch((err) => console.error("App failed:", err));
});
