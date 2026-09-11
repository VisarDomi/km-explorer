// Safari can report scrollend before its visible movement has settled.
// Read the final position after 100 ms; never block native scrolling.
export function onSettledScroll(callback: () => void): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    window.addEventListener('scroll', cancel, { passive: true });
    window.addEventListener('scrollend', () => {
        cancel();
        if (!active || document.hidden) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (active && !document.hidden) callback();
        }, 100);
    });
    window.addEventListener('pagehide', () => { active = false; cancel(); });
    window.addEventListener('pageshow', () => { active = true; });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancel();
    });
}
