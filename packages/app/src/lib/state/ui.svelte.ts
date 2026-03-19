export class UIState {
    listViewGeneration = $state(0);
    // Swipe-to-go-back gesture state
    swipeProgress = $state(0);
    isSwiping = $state(false);
    swipeAnimating = $state(false);

    bumpListGeneration() {
        this.listViewGeneration++;
    }

    startSwipe() {
        this.isSwiping = true;
    }

    updateSwipe(progress: number) {
        this.swipeProgress = progress;
    }

    endSwipe(committed: boolean) {
        this.swipeAnimating = true;

        if (committed) {
            this.swipeProgress = 1;
        } else {
            this.swipeProgress = 0;
        }

        setTimeout(() => {
            this.isSwiping = false;
            this.swipeAnimating = false;
            this.swipeProgress = 0;
        }, 250);
    }
}
