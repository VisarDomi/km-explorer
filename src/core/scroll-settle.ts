// Use the position at scrollend without an additional settling timer.
export function onSettledScroll(callback: () => void): void {
    let active = true;
    window.addEventListener('scrollend', () => {
        if (active && !document.hidden) callback();
    });
    window.addEventListener('pagehide', () => { active = false; });
    window.addEventListener('pageshow', () => { active = true; });
}
