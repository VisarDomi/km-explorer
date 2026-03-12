import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { VideoProvider } from '@km-explorer/provider-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '..', '..', '..', 'extensions', 'dist', 'bundles', 'ytb.js');

let _provider: VideoProvider | null = null;

export async function loadProvider(): Promise<VideoProvider> {
  if (_provider) return _provider;
  if (!existsSync(BUNDLE_PATH)) {
    throw new Error(`Provider bundle not found: ${BUNDLE_PATH}`);
  }
  const mod = await import(BUNDLE_PATH);
  _provider = mod.default as VideoProvider;
  return _provider;
}

export function getProvider(): VideoProvider {
  if (!_provider) throw new Error('Provider not loaded — call loadProvider() first');
  return _provider;
}
