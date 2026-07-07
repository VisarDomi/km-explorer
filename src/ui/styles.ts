export const STYLES = `
#km-root {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #0a0a0a;
  color: #eee;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

#km-root * {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.km-hidden {
  display: none !important;
}

/* --- header --- */

.km-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.km-header .km-back-btn {
  background: none;
  border: none;
  color: #4af;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  flex-shrink: 0;
}

.km-header .km-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.km-header .km-fav-btn {
  background: none;
  border: none;
  color: #4af;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  flex-shrink: 0;
}

/* --- search bar --- */

.km-search-wrap {
  padding: 10px 12px;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.km-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #1a1a1a;
  color: #eee;
  font-size: 14px;
  outline: none;
}

.km-search-input:focus {
  border-color: #4af;
}

/* --- grid --- */

.km-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  align-content: start;
}

/* --- card --- */

.km-card {
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s;
}

.km-card:active {
  transform: scale(0.97);
}

.km-card .km-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  background: #222;
}

.km-card .km-body {
  padding: 6px 8px;
}

.km-card .km-card-title {
  font-size: 12px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #ccc;
}

.km-card .km-card-actions {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px 6px;
}

.km-card .km-heart {
  background: none;
  border: none;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
}

.km-card .km-heart.km-faved {
  color: #e33;
}

/* --- actor dropdown --- */

.km-actor-dropdown {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1aee;
  backdrop-filter: blur(4px);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #333;
}

.km-actor-btn {
  background: #333;
  border: none;
  color: #eee;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.km-actor-btn:hover {
  background: #4af;
  color: #000;
}

/* --- sentinel --- */

.km-sentinel {
  grid-column: 1 / -1;
  height: 1px;
}

/* --- toast --- */

.km-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: #eee;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 13px;
  z-index: 100001;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.km-toast.km-toast-visible {
  opacity: 1;
}

/* --- loading --- */

.km-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  grid-column: 1 / -1;
}

.km-spinner::after {
  content: "";
  width: 20px;
  height: 20px;
  border: 2px solid #333;
  border-top-color: #4af;
  border-radius: 50%;
  animation: km-spin 0.6s linear infinite;
}

@keyframes km-spin {
  to { transform: rotate(360deg); }
}

/* --- scrollbar --- */

.km-grid::-webkit-scrollbar {
  width: 4px;
}

.km-grid::-webkit-scrollbar-track {
  background: transparent;
}

.km-grid::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}
`;
