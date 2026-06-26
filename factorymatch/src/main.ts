import "./style.css";
import "@pixi/layout";

import { FactoryMatchApp } from "./FactoryMatchApp";
import { FactoryMatchConfig } from "./FactoryMatchConfig";
import { ModelLibraryService } from "./services/ModelLibraryService";

async function start(): Promise<void> {
  const stage = document.getElementById("stage");
  if (!stage) throw new Error("Missing #stage element");

  const config = new FactoryMatchConfig();
  // Prepare the per-kind shapes up front so the pile can spawn them synchronously.
  // ModelLibraryService is the asset-integration seam: it builds placeholder
  // primitives today; integrating real models is a swap inside that class (a failed
  // load would reject here and surface via start().catch — no partial run).
  const models = new ModelLibraryService(config);
  await models.load();

  const app = new FactoryMatchApp(stage, config, models);
  await app.initialize();
  app.mainLoop();
}

window.addEventListener("load", () => {
  start().catch((err) => console.error("App failed:", err));
});
