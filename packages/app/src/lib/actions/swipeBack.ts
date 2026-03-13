import { appDimensions } from '$lib/state/appDimensions.js';
import { SWIPE_THRESHOLD, DEADZONE_RATIO, EDGE_ZONE_RATIO } from '../constants.js';

interface SwipeBackOptions {
    onClose: () => void;
    onSwipeStart: () => void;
    onSwipeUpdate: (progress: number) => void;
    onSwipeEnd: (committed: boolean) => void;
}

export function swipeBack(node: HTMLElement, options: SwipeBackOptions) {
    let tracking = false;
    let startX = 0;
    let startY = 0;
    let locked = false;
    let rejected = false;
    let lockDx = 0;
    let opts = options;
    let lastProgress = 0;

    function onStart(e: TouchEvent) {
        const touch = e.touches[0];
        const edgeZone = appDimensions.width * EDGE_ZONE_RATIO;
        if (touch.clientX <= edgeZone) {
            tracking = true;
            locked = false;
            rejected = false;
            lockDx = 0;
            lastProgress = 0;
            startX = touch.clientX;
            startY = touch.clientY;
        }
    }

    function onMove(e: TouchEvent) {
        if (!tracking || rejected) return;

        const touch = e.touches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const appWidth = appDimensions.width;

        if (!locked) {
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const deadzone = appWidth * DEADZONE_RATIO;
            if (absDx < deadzone && absDy < deadzone) return;
            if (absDy > absDx) {
                rejected = true;
                tracking = false;
                return;
            }
            locked = true;
            lockDx = dx;
            opts.onSwipeStart();
        }

        e.preventDefault();

        const travel = dx - lockDx;
        const maxTravel = appWidth - lockDx;
        lastProgress = Math.max(0, Math.min(1, travel / maxTravel));
        opts.onSwipeUpdate(lastProgress);
    }

    function onEnd() {
        if (!tracking || !locked) {
            tracking = false;
            return;
        }

        tracking = false;
        const committed = lastProgress > SWIPE_THRESHOLD;

        opts.onSwipeEnd(committed);

        if (committed) {
            setTimeout(() => {
                opts.onClose();
            }, 250);
        }
    }

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });

    return {
        update(newOptions: SwipeBackOptions) {
            opts = newOptions;
        },
        destroy() {
            node.removeEventListener('touchstart', onStart);
            node.removeEventListener('touchmove', onMove);
            node.removeEventListener('touchend', onEnd);
        }
    };
}
