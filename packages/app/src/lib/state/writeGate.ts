export class WriteToken {
    readonly owner: string;
    readonly signal: AbortSignal;

    constructor(owner: string, signal: AbortSignal) {
        this.owner = owner;
        this.signal = signal;
    }

    get cancelled(): boolean {
        return this.signal.aborted;
    }
}

export class WriteGate {
    private controller: AbortController | null = null;
    private token: WriteToken | null = null;

    get isHeld(): boolean {
        return this.token !== null && !this.token.cancelled;
    }

    /** Forceful acquire — cancels previous holder. For user actions, restore. */
    acquire(owner: string): WriteToken {
        this.controller?.abort();
        this.controller = new AbortController();
        this.token = new WriteToken(owner, this.controller.signal);
        return this.token;
    }

    /** Polite acquire — returns null if gate is held. For sentinel. */
    tryAcquire(owner: string): WriteToken | null {
        if (this.isHeld) return null;
        return this.acquire(owner);
    }

    /** Voluntary release of a specific token. */
    release(token: WriteToken): void {
        if (this.token === token) {
            this.token = null;
            this.controller = null;
        }
    }
}
