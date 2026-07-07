import type { VideoStub } from "../core/types.js";
import type { UIManager } from "./ui-manager.js";

export interface ListCallbacks {
  onSearch: (query: string) => void;
  onLoadMore: () => void;
  onCardClick: (video: VideoStub) => void;
  onToggleFavorite: (video: VideoStub) => void;
  isFavorited: (id: string) => boolean;
}

export class ListManager {
  private ui: UIManager;
  private callbacks: ListCallbacks;
  private sentinel: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(ui: UIManager, callbacks: ListCallbacks) {
    this.ui = ui;
    this.callbacks = callbacks;

    this.ui.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        callbacks.onSearch(this.ui.searchInput.value.trim());
      }
    });
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
    // remove existing sentinel
    this._unmountSentinel();

    for (const video of videos) {
      grid.appendChild(this._createCard(video));
    }

    if (hasMore) {
      this._mountSentinel(grid);
    }
  }

  private _createCard(video: VideoStub): HTMLElement {
    const card = document.createElement("div");
    card.className = "km-card";
    card.dataset.videoId = video.id;

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

    const actions = document.createElement("div");
    actions.className = "km-card-actions";

    const heart = document.createElement("button");
    heart.className = "km-heart";
    if (this.callbacks.isFavorited(video.id)) {
      heart.classList.add("km-faved");
    }
    heart.textContent = this.callbacks.isFavorited(video.id) ? "\u2764" : "\u2661";
    heart.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onToggleFavorite(video);
    });

    actions.appendChild(heart);
    card.append(img, body, actions);

    card.addEventListener("click", () => this.callbacks.onCardClick(video));

    return card;
  }

  refreshFavHeart(videoId: string): void {
    const grid = this.ui.grid;
    const hearts = grid.querySelectorAll<HTMLButtonElement>(".km-heart");
    const cards = grid.querySelectorAll<HTMLElement>(".km-card");
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const vid = card.dataset.videoId;
      if (vid === videoId && hearts[i]) {
        const faved = this.callbacks.isFavorited(videoId);
        hearts[i].classList.toggle("km-faved", faved);
        hearts[i].textContent = faved ? "\u2764" : "\u2661";
        return;
      }
    }
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
