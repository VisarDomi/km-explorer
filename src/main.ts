import { AppController } from "./core/app-controller.js";

document.open();
document.close();
document.title = "KM Explorer";

const app = new AppController();
await app.init();
