import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTEND_BUILD_DIR } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loadProvider } from './services/providerLoader.js';
import healthRouter from './routes/health.js';
import imageRouter from './routes/image.js';
import certRouter from './routes/cert.js';
import proxyRouter from './routes/proxy.js';
import videosRouter from './routes/videos.js';
import detailsRouter from './routes/details.js';
import type { Request, Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

await loadProvider();

const providersDir = path.join(__dirname, '..', '..', 'extensions', 'dist');
if (fs.existsSync(providersDir)) {
  app.use('/providers', express.static(providersDir));
}

if (fs.existsSync(FRONTEND_BUILD_DIR)) {
  app.use(express.static(FRONTEND_BUILD_DIR));
}

app.use('/api', healthRouter);
app.use('/api', imageRouter);
app.use('/api', certRouter);
app.use('/api', proxyRouter);
app.use('/api', videosRouter);
app.use('/api', detailsRouter);

app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
  const indexPath = path.join(FRONTEND_BUILD_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built');
  }
});

app.use(errorHandler);

export default app;
