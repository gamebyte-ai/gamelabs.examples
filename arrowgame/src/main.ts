import { ArrowGameApp } from "./ArrowGameApp";

// Bootstrap the Arrow Nudge Escape game.
const app = new ArrowGameApp(document.getElementById("stage")!);
await app.initialize();
app.mainLoop();