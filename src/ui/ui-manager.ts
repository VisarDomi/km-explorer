import { STYLES } from "./styles.js";

export type ViewMode = "list" | "channel" | "favorites";

export class UIManager {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  readonly backBtn: HTMLButtonElement;
  readonly titleEl: HTMLElement;
  readonly favBtn: HTMLButtonElement;
  readonly searchWrap: HTMLElement;
  readonly searchInput: HTMLInputElement;
  readonly grid: HTMLElement;
  readonly toast: HTMLElement;
  readonly views: Record<ViewMode, HTMLElement>;

  private _viewMode: ViewMode = "list";

  constructor() {
    this._injectStyles();

    this.root = document.createElement("div");
    this.root.id = "km-root";
    document.body.appendChild(this.root);

    // header
    this.header = document.createElement("div");
    this.header.className = "km-header";

    this.backBtn = document.createElement("button");
    this.backBtn.className = "km-back-btn";
    this.backBtn.textContent = "\u2190";

    this.titleEl = document.createElement("span");
    this.titleEl.className = "km-title";
    this.titleEl.textContent = "KM Explorer";

    this.favBtn = document.createElement("button");
    this.favBtn.className = "km-fav-btn";
    this.favBtn.textContent = "\u2661";

    this.header.append(this.backBtn, this.titleEl, this.favBtn);
    this.root.appendChild(this.header);

    // search
    this.searchWrap = document.createElement("div");
    this.searchWrap.className = "km-search-wrap";
    this.searchInput = document.createElement("input");
    this.searchInput.className = "km-search-input";
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search...";
    this.searchWrap.appendChild(this.searchInput);
    this.root.appendChild(this.searchWrap);

    // grid
    this.grid = document.createElement("div");
    this.grid.className = "km-grid";
    this.root.appendChild(this.grid);

    // toast
    this.toast = document.createElement("div");
    this.toast.className = "km-toast";
    this.toast.id = "km-toast";
    document.body.appendChild(this.toast);

    // views
    this.views = {
      list: this.grid,
      channel: this.grid,
      favorites: this.grid,
    };

    this._updateVisibility();
  }

  get viewMode(): ViewMode {
    return this._viewMode;
  }

  setViewMode(mode: ViewMode): void {
    this._viewMode = mode;
    this._updateVisibility();
  }

  private _updateVisibility(): void {
    const isList = this._viewMode === "list";
    this.backBtn.classList.toggle("km-hidden", isList);
    this.searchWrap.classList.toggle("km-hidden", this._viewMode !== "list");
    this.favBtn.classList.toggle("km-hidden", this._viewMode !== "list");
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
  }

  showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.add("km-toast-visible");
    setTimeout(() => this.toast.classList.remove("km-toast-visible"), 2500);
  }

  private _injectStyles(): void {
    const style = document.createElement("style");
    style.id = "km-styles";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
}
