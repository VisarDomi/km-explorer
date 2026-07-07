import type { VideoStub, Actor } from "../core/types.js";
import type { UIManager } from "./ui-manager.js";

export interface ChannelCallbacks {
  onBack: () => void;
  onLoadMore: () => void;
  onCopyVideoSrc: (video: VideoStub) => void;
}

export class ChannelManager {
  private ui: UIManager;
  private callbacks: ChannelCallbacks;
  private sentinel: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private _actor: Actor | null = null;

  constructor(ui: UIManager, callbacks: ChannelCallbacks) {
    this.ui = ui;
    this.callbacks = callbacks;

    this.ui.backBtn.addEventListener("click", () => callbacks.onBack());
  }

  open(actor: Actor, videos: VideoStub[], hasMore: boolean): void {
    this._actor = actor;
    this.ui.setViewMode("channel");
    this.ui.setTitle(actor.name);
    this.render(videos, hasMore);
  }

  render(videos: VideoStub[], hasMore: boolean): void {
    const grid = this.ui.grid;
    grid.innerHTML = "";

    for (const video of videos) {
      grid.appendChild(this._createCard(video));
    }

    if (hasMore) {
      this._mountSentinel(grid);
    } else {
      this._unmountSentinel();
    }
  }

  append(videos: VideoStub[], hasMore: boolean): void {
    const grid = this.ui.grid;
    this._unmountSentinel();

    for (const video of videos) {
      grid.appendChild(this._createCard(video));
    }

    if (hasMore) {
      this._mountSentinel(grid);
    }
  }

  get actor(): Actor | null {
    return this._actor;
  }

  private _createCard(video: VideoStub): HTMLElement {
    const card = document.createElement("div");
    card.className = "km-card";

    const img = document.createElement("img");
    img.className = "km-thumb";
    img.src = video.thumbnail;
    img.loading = "lazy";

    const body = document.createElement("div");
    body.className = "km-body";

    const title = document.createElement("div");
    title.className = "km-card-title";
    title.textContent = video.title;

    body.appendChild(title);
    card.append(img, body);

    card.addEventListener("click", () => this.callbacks.onCopyVideoSrc(video));

    return card;
  }

  private _mountSentinel(grid: HTMLElement): void {
    if (this.sentinel) return;
    this.sentinel = document.createElement("div");
    this.sentinel.className = "km-sentinel";
    grid.appendChild(this.sentinel);

    this.observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        this.callbacks.onLoadMore();
      }
    }, { root: grid, threshold: 0.1 });

    this.observer.observe(this.sentinel);
  }

  private _unmountSentinel(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.sentinel?.remove();
    this.sentinel = null;
  }

  destroy(): void {
    this._unmountSentinel();
  }
}
