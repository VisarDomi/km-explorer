import { EventEmitter } from 'node:events';
import { getProvider } from './providerLoader.js';
import { getCachedDetail, setCachedDetail, type CachedDetail } from './database.js';
import { proxyFetch } from '../utils/proxyFetch.js';
import { USER_AGENT } from '../config.js';

const DELAY_MS = 500;

interface QueueItem {
  videoUrl: string;
}

class ScrapeQueue extends EventEmitter {
  private queue: QueueItem[] = [];
  private processing = false;
  private pending = new Set<string>();

  enqueue(urls: string[]): void {
    for (const videoUrl of urls) {
      if (this.pending.has(videoUrl)) continue;
      if (getCachedDetail(videoUrl)) continue;
      this.pending.add(videoUrl);
      this.queue.push({ videoUrl });
    }
    if (!this.processing) this.process();
  }

  private async process(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.scrapeOne(item.videoUrl);
      } catch (e) {
        console.error(`[scrape] Failed: ${item.videoUrl}`, (e as Error).message);
      }
      this.pending.delete(item.videoUrl);
      if (this.queue.length > 0) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    this.processing = false;
  }

  private async scrapeOne(videoUrl: string): Promise<void> {
    const provider = getProvider();
    const req = provider.videoDetailRequest(videoUrl);
    const r = await proxyFetch(req.url, {
      headers: { 'User-Agent': USER_AGENT, ...req.headers },
    });
    const html = await r.text();
    const detail = provider.parseVideoDetailResponse(html);
    setCachedDetail(videoUrl, detail.videoSrc, detail.actors);
    const cached: CachedDetail = { videoSrc: detail.videoSrc, actors: detail.actors };
    this.emit('detail', videoUrl, cached);
  }

  isPending(url: string): boolean {
    return this.pending.has(url);
  }
}

export const scrapeQueue = new ScrapeQueue();
