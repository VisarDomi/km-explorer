import type { VideoStub } from "../core/types.js";
import type { UIManager } from "./ui-manager.js";

export interface FavoritesCallbacks {
  onBack: () => void;
  onToggleFavorite: (video: VideoStub) => void;
  isFavorited: (id: string) => boolean;
  onExport: () => Promise<string[]>;
  onMerge: (ids: string[]) => Promise<number>;
}

export class FavoritesManager {
  private ui: UIManager;
  private callbacks: FavoritesCallbacks;
  private importPanel: HTMLElement | null = null;
  private importTextarea: HTMLTextAreaElement | null = null;
  private importStatus: HTMLElement | null = null;

  constructor(ui: UIManager, callbacks: FavoritesCallbacks) {
    this.ui = ui;
    this.callbacks = callbacks;
  }

  open(videos: VideoStub[]): void {
    this.ui.setViewMode("favorites");
    this.ui.setTitle("Favorites");
    this.render(videos);
  }

  render(videos: VideoStub[]): void {
    const grid = this.ui.grid;
    grid.innerHTML = "";

    // Export/Import row
    const ioRow = document.createElement("div");
    ioRow.style.cssText = "grid-column:1/-1;display:flex;gap:8px;padding:8px 0;";

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export";
    exportBtn.style.cssText = "background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;";
    exportBtn.addEventListener("click", async () => {
      const ids = await this.callbacks.onExport();
      this._showImportPanel(ids.join("\n"));
    });

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import";
    importBtn.style.cssText = "background:#333;color:#ccc;border:1px solid #555;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;";
    importBtn.addEventListener("click", () => this._showImportPanel(""));

    ioRow.append(exportBtn, importBtn);
    grid.appendChild(ioRow);

    // Import panel (hidden initially)
    this.importPanel = document.createElement("div");
    this.importPanel.style.cssText = "grid-column:1/-1;display:none;padding:8px 0;";

    this.importTextarea = document.createElement("textarea");
    this.importTextarea.style.cssText = "width:100%;min-height:60px;padding:8px;background:#111;color:#ccc;border:1px solid #555;border-radius:4px;font:13px monospace;resize:vertical;box-sizing:border-box;";
    this.importTextarea.placeholder = "Paste IDs, one per line";

    const mergeRow = document.createElement("div");
    mergeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;";

    const mergeBtn = document.createElement("button");
    mergeBtn.textContent = "Merge";
    mergeBtn.style.cssText = "background:#4a4;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;";
    mergeBtn.addEventListener("click", async () => {
      const raw = this.importTextarea!.value;
      const ids = raw.split(/[\n\s]+/).map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        this.importStatus!.textContent = "No IDs found";
        return;
      }
      mergeBtn.disabled = true;
      mergeBtn.textContent = "Merging...";
      try {
        const added = await this.callbacks.onMerge(ids);
        this.importStatus!.textContent = `Added ${added} of ${ids.length} IDs${ids.length - added > 0 ? ` (${ids.length - added} already existed)` : ""}`;
      } catch (e) {
        this.importStatus!.textContent = "Error: " + (e as Error).message;
      } finally {
        mergeBtn.disabled = false;
        mergeBtn.textContent = "Merge";
      }
    });

    this.importStatus = document.createElement("span");
    this.importStatus.style.cssText = "color:#aaa;font-size:12px;";

    mergeRow.append(mergeBtn, this.importStatus);
    this.importPanel.append(this.importTextarea, mergeRow);
    grid.appendChild(this.importPanel);

    // Cards
    if (videos.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "grid-column:1/-1;text-align:center;padding:40px 0;color:#666;";
      empty.textContent = "No favorites yet";
      grid.appendChild(empty);
    } else {
      for (const video of videos) {
        grid.appendChild(this._createCard(video));
      }
    }
  }

  private _showImportPanel(text: string): void {
    if (!this.importPanel || !this.importTextarea || !this.importStatus) return;
    this.importPanel.style.display = "block";
    this.importTextarea.value = text;
    this.importStatus.textContent = "";
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

    const actions = document.createElement("div");
    actions.className = "km-card-actions";

    const heart = document.createElement("button");
    heart.className = "km-heart km-faved";
    heart.textContent = "\u2764";
    heart.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onToggleFavorite(video);
    });

    actions.appendChild(heart);
    card.append(img, body, actions);

    return card;
  }
}
