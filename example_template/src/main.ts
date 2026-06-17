import "./style.css";
import "@pixi/layout";

import { TemplateApp } from "./TemplateApp";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const app = new TemplateApp(stage);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch((err) => console.error("App failed:", err));
});
