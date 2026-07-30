const EDGE_WIDTH = 28;
const AXIS_THRESHOLD = 8;
const SEEK_SECONDS_PER_WIDTH = 60;

export function addVideoScrubbing(video: HTMLVideoElement): void {
    let startX = 0;
    let startY = 0;
    let axis: 'none' | 'x' | 'y' | 'browser' = 'none';
    let seekBase = 0;

    video.addEventListener('touchstart', event => {
        if (event.touches.length > 1) {
            axis = 'browser';
            return;
        }
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        axis = touch.clientX <= EDGE_WIDTH ? 'browser' : 'none';
        seekBase = video.currentTime;
    }, { passive: true, capture: true });

    video.addEventListener('touchmove', event => {
        if (axis === 'browser') return;
        if (event.touches.length > 1) {
            axis = 'browser';
            return;
        }
        if (event.touches.length !== 1) return;

        const touch = event.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (axis === 'none') {
            if (Math.max(Math.abs(dx), Math.abs(dy)) <= AXIS_THRESHOLD) return;
            axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
        }
        if (axis !== 'x') return;

        event.preventDefault();
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        const viewportWidth = Math.max(1, window.innerWidth);
        const target = seekBase + (dx / viewportWidth) * SEEK_SECONDS_PER_WIDTH;
        video.currentTime = Math.max(0, Math.min(duration, target));
    }, { passive: false, capture: true });

    video.addEventListener('touchend', event => {
        if (axis === 'x') void video.play();
        if (event.touches.length === 0) axis = 'none';
    }, { capture: true });

    video.addEventListener('touchcancel', () => {
        axis = 'none';
    }, { capture: true });
}
