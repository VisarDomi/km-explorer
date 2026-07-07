import type { VideoStub, Actor } from "./types.js";
import type { ViewMode } from "../ui/ui-manager.js";

export type { ViewMode };

export class AppState {
  // List
  listVideos: VideoStub[] = [];
  listQuery = "";
  listPage = 0;
  listHasMore = false;
  listLoading = false;

  // Channel
  channelActor: Actor | null = null;
  channelVideos: VideoStub[] = [];
  channelPage = 0;
  channelHasMore = false;
  channelLoading = false;

  // Favorites
  favorites: VideoStub[] = [];
  favoriteIds = new Set<string>();

  viewMode: ViewMode = "list";

  isFavorited(id: string): boolean {
    return this.favoriteIds.has(id);
  }

  addFavorite(video: VideoStub): void {
    if (this.favoriteIds.has(video.id)) return;
    this.favorites = [...this.favorites, video];
    this.favoriteIds = new Set(this.favorites.map(v => v.id));
  }

  removeFavorite(id: string): void {
    this.favorites = this.favorites.filter(v => v.id !== id);
    this.favoriteIds = new Set(this.favorites.map(v => v.id));
  }

  setFavorites(videos: VideoStub[]): void {
    this.favorites = videos;
    this.favoriteIds = new Set(videos.map(v => v.id));
  }
}
