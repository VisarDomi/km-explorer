import { AppState } from "./app-state.js";
import { UIManager } from "../ui/ui-manager.js";
import { ListManager } from "../ui/list-manager.js";
import { ChannelManager } from "../ui/channel-manager.js";
import { FavoritesManager } from "../ui/favorites-manager.js";
import * as api from "../services/api.js";
import * as cache from "../services/cache-db.js";
import type { VideoStub, Actor } from "./types.js";

export class AppController {
  private state: AppState;
  private ui: UIManager;
  private listMgr: ListManager;
  private channelMgr: ChannelManager;
  private favMgr: FavoritesManager;

  constructor() {
    this.state = new AppState();
    this.ui = new UIManager();

    // Fav button in header
    this.ui.favBtn.addEventListener("click", () => this.openFavorites());

    // List
    this.listMgr = new ListManager(this.ui, {
      onSearch: (q) => this.search(q),
      onLoadMore: () => this.loadMoreList(),
      onCardClick: (v) => this.handleCardClick(v),
      onToggleFavorite: (v) => this.toggleFavorite(v),
      isFavorited: (id) => this.state.isFavorited(id),
    });

    // Channel
    this.channelMgr = new ChannelManager(this.ui, {
      onBack: () => this.closeChannel(),
      onLoadMore: () => this.loadMoreChannel(),
      onCopyVideoSrc: (v) => this.copyVideoSrc(v),
    });

    // Favorites
    this.favMgr = new FavoritesManager(this.ui, {
      onBack: () => this.closeFavorites(),
      onToggleFavorite: (v) => this.toggleFavorite(v),
      isFavorited: (id) => this.state.isFavorited(id),
      onExport: () => cache.exportFavoriteIds(),
      onMerge: async (ids) => {
        const added = await cache.mergeFavorites(ids);
        const favs = await cache.getAllFavorites();
        this.state.setFavorites(favs);
        this.favMgr.render(favs);
        return added;
      },
    });
  }

  async init(): Promise<void> {
    // Load favorites
    const favs = await cache.getAllFavorites();
    this.state.setFavorites(favs);

    // Load latest page 1
    await this.search("");
  }

  // --- List ---

  async search(query: string): Promise<void> {
    this.state.viewMode = "list";
    this.state.listQuery = query;
    this.state.listPage = 1;
    this.state.listVideos = [];
    this.state.listLoading = true;
    this.ui.setViewMode("list");
    this.ui.setTitle(query ? `Search: ${query}` : "KM Explorer");
    this.listMgr.render([], true);

    try {
      const result = query
        ? await api.searchVideos(query, 1)
        : await api.fetchLatest(1);
      this.state.listVideos = result.items;
      this.state.listHasMore = result.hasMore;
      this.state.listPage = 1;
      this.listMgr.render(result.items, result.hasMore);
    } catch (e) {
      this.ui.showToast(`Failed: ${(e as Error).message}`);
      this.listMgr.render([], false);
    } finally {
      this.state.listLoading = false;
    }
  }

  async loadMoreList(): Promise<void> {
    if (this.state.listLoading || !this.state.listHasMore) return;
    this.state.listLoading = true;
    const nextPage = this.state.listPage + 1;

    try {
      const result = this.state.listQuery
        ? await api.searchVideos(this.state.listQuery, nextPage)
        : await api.fetchLatest(nextPage);
      this.state.listVideos = [...this.state.listVideos, ...result.items];
      this.state.listHasMore = result.hasMore;
      this.state.listPage = nextPage;
      this.listMgr.append(result.items, result.hasMore);
    } catch (e) {
      this.ui.showToast(`Failed: ${(e as Error).message}`);
    } finally {
      this.state.listLoading = false;
    }
  }

  // --- Card interaction ---

  async handleCardClick(video: VideoStub): Promise<void> {
    try {
      const detail = await api.scrapeVideoDetail(video.pageUrl);
      if (detail.videoSrc) {
        await navigator.clipboard.writeText(detail.videoSrc);
        this.ui.showToast("Copied");
      }

      if (detail.actors.length === 1) {
        this.openChannel(detail.actors[0]);
      } else if (detail.actors.length > 1) {
        // multiple actors — show picker inline, then navigate
        const actor = await this._pickActor(detail.actors);
        if (actor) this.openChannel(actor);
      } else {
        this.ui.showToast("No actors found");
      }
    } catch (e) {
      this.ui.showToast(`Scrape failed: ${(e as Error).message}`);
    }
  }

  private _pickActor(actors: Actor[]): Promise<Actor | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "km-actor-dropdown";
      overlay.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#1a1a1aee;backdrop-filter:blur(4px);display:flex;flex-wrap:wrap;gap:6px;padding:12px;border-top:1px solid #333;z-index:100000;";

      for (const actor of actors) {
        const btn = document.createElement("button");
        btn.className = "km-actor-btn";
        btn.textContent = actor.name;
        btn.addEventListener("click", () => {
          overlay.remove();
          resolve(actor);
        });
        overlay.appendChild(btn);
      }

      const dismiss = document.createElement("button");
      dismiss.className = "km-actor-btn";
      dismiss.textContent = "Cancel";
      dismiss.style.cssText = "background:#444;";
      dismiss.addEventListener("click", () => {
        overlay.remove();
        resolve(null);
      });
      overlay.appendChild(dismiss);

      document.body.appendChild(overlay);
    });
  }

  async copyVideoSrc(video: VideoStub): Promise<void> {
    try {
      const detail = await api.scrapeVideoDetail(video.pageUrl);
      if (detail.videoSrc) {
        await navigator.clipboard.writeText(detail.videoSrc);
        this.ui.showToast("Copied");
      } else {
        this.ui.showToast("No video source found");
      }
    } catch (e) {
      this.ui.showToast(`Scrape failed: ${(e as Error).message}`);
    }
  }

  // --- Channel ---

  async openChannel(actor: Actor): Promise<void> {
    this.state.viewMode = "channel";
    this.state.channelActor = actor;
    this.state.channelVideos = [];
    this.state.channelPage = 1;
    this.state.channelLoading = true;
    this.ui.setViewMode("channel");
    this.ui.setTitle(actor.name);
    this.channelMgr.open(actor, [], true);

    try {
      const result = await api.fetchChannel(actor.url, 1);
      this.state.channelVideos = result.items;
      this.state.channelHasMore = result.hasMore;
      this.state.channelPage = 1;
      this.channelMgr.render(result.items, result.hasMore);
    } catch (e) {
      this.ui.showToast(`Failed: ${(e as Error).message}`);
    } finally {
      this.state.channelLoading = false;
    }
  }

  async loadMoreChannel(): Promise<void> {
    if (this.state.channelLoading || !this.state.channelHasMore || !this.state.channelActor) return;
    this.state.channelLoading = true;
    const nextPage = this.state.channelPage + 1;

    try {
      const result = await api.fetchChannel(this.state.channelActor.url, nextPage);
      this.state.channelVideos = [...this.state.channelVideos, ...result.items];
      this.state.channelHasMore = result.hasMore;
      this.state.channelPage = nextPage;
      this.channelMgr.append(result.items, result.hasMore);
    } catch (e) {
      this.ui.showToast(`Failed: ${(e as Error).message}`);
    } finally {
      this.state.channelLoading = false;
    }
  }

  closeChannel(): void {
    this.state.viewMode = "list";
    this.ui.setViewMode("list");
    this.ui.setTitle(this.state.listQuery ? `Search: ${this.state.listQuery}` : "KM Explorer");
    this.listMgr.render(this.state.listVideos, this.state.listHasMore);
  }

  // --- Favorites ---

  async openFavorites(): Promise<void> {
    this.state.viewMode = "favorites";
    this.ui.setViewMode("favorites");
    this.ui.setTitle("Favorites");
    this.favMgr.open(this.state.favorites);
  }

  closeFavorites(): void {
    this.state.viewMode = "list";
    this.ui.setViewMode("list");
    this.ui.setTitle(this.state.listQuery ? `Search: ${this.state.listQuery}` : "KM Explorer");
    this.listMgr.render(this.state.listVideos, this.state.listHasMore);
  }

  // --- Favorites toggle ---

  async toggleFavorite(video: VideoStub): Promise<void> {
    const wasFaved = this.state.isFavorited(video.id);
    if (wasFaved) {
      this.state.removeFavorite(video.id);
      await cache.removeFavorite(video.id);
    } else {
      this.state.addFavorite(video);
      await cache.addFavorite(video);
    }
    this.listMgr.refreshFavHeart(video.id);
    this.ui.showToast(wasFaved ? "Removed" : "Favorited");
  }
}
