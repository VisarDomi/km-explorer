import type { ViewMode, ViewFrame } from '../types.js';

export class UIState {
    viewMode = $state<ViewMode>('list');
    viewStack = $state<ViewFrame[]>([]);
    listViewGeneration = $state(0);
    // Swipe-to-go-back gesture state
    swipeProgress = $state(0);
    isSwiping = $state(false);
    swipeAnimating = $state(false);

    /** Callback invoked after every view transition so AppState can persist the session. */
    onViewChange: (() => void) | null = null;

    /**
     * Callback to capture the current view's scroll target before pushing.
     * AppState sets this to move lastVisibleVideoId into the frame.
     */
    captureScrollTarget: (() => string | undefined) | null = null;

    /**
     * Callback invoked when a frame is popped, so AppState can restore
     * the previous view's scroll target from the frame.
     */
    onFrameRestored: ((frame: ViewFrame) => void) | null = null;

    pushView(mode: ViewMode) {
        const targetVideoId = this.captureScrollTarget?.();
        this.viewStack = [...this.viewStack, { mode: this.viewMode, targetVideoId }];
        this.viewMode = mode;
        if (mode === 'list') this.listViewGeneration++;
        this.onViewChange?.();
    }

    popView() {
        const stack = this.viewStack;
        if (stack.length === 0) return;
        const frame = stack[stack.length - 1];
        this.viewStack = stack.slice(0, -1);
        this.viewMode = frame.mode;
        if (frame.mode === 'list') this.listViewGeneration++;
        this.onFrameRestored?.(frame);
        this.onViewChange?.();
    }

    peekBack(): ViewMode {
        const frame = this.viewStack[this.viewStack.length - 1];
        return frame?.mode ?? 'list';
    }

    canGoBack(): boolean {
        return this.viewStack.length > 0;
    }

    resetTo(mode: ViewMode) {
        this.viewStack = [];
        this.viewMode = mode;
        if (mode === 'list') this.listViewGeneration++;
        this.onViewChange?.();
    }

    setViewDirect(mode: ViewMode, stack: ViewFrame[]) {
        this.viewStack = stack;
        this.viewMode = mode;
        if (mode === 'list') this.listViewGeneration++;
    }

    get previousViewMode(): ViewMode {
        return this.peekBack();
    }
}
