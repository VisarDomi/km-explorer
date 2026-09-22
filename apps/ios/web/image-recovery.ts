// Thumbnail failures must recover too; the shared card still owns the image/UI.
export function installImageRecovery(): void {
    const pending = new Map<HTMLImageElement, {source: string; delay: number; timer?: ReturnType<typeof setTimeout>}>();
    const retry = (image: HTMLImageElement) => {
        const state = pending.get(image);
        if (!state) return;
        clearTimeout(state.timer); state.timer = undefined;
        if (!image.isConnected || image.src !== state.source) { pending.delete(image); return; }
        if (!document.hidden && navigator.onLine) image.src = state.source;
    };
    document.addEventListener('error', event => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        let state = pending.get(image);
        if (!state || state.source !== image.src) {
            if (state?.timer) clearTimeout(state.timer);
            state = {source: image.src, delay: 1000}; pending.set(image, state);
        }
        if (!state.timer) { state.timer = setTimeout(() => retry(image), state.delay); state.delay = Math.min(30000, state.delay * 2); }
    }, true);
    document.addEventListener('load', event => {
        if (!(event.target instanceof HTMLImageElement)) return;
        clearTimeout(pending.get(event.target)?.timer); pending.delete(event.target);
    }, true);
    const resume = () => { for (const image of [...pending.keys()]) retry(image); };
    addEventListener('online', resume); addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    addEventListener('pagehide', () => { for (const state of pending.values()) { clearTimeout(state.timer); state.timer = undefined; } });
}
