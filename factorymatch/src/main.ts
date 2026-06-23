import "./style.css";
import "@pixi/layout";

import { FactoryMatchApp } from "./FactoryMatchApp";
import { FactoryMatchConfig } from "./FactoryMatchConfig";
import { ModelLibrary } from "./utilities/ModelLibrary";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  // Load the 3D models up front so the pile can spawn them synchronously.
  const models = new ModelLibrary(new FactoryMatchConfig());
  await models.load();

  const app = new FactoryMatchApp(stage, models);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch((err) => console.error("App failed:", err));
});
