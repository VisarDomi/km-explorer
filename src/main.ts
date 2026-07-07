import { preparePageEnvironment, startDOMSanitizer } from "./core/environment.js";
import { AppController } from "./core/app-controller.js";

const { setInterval } = preparePageEnvironment();
startDOMSanitizer(setInterval);

const app = new AppController();
await app.init();
