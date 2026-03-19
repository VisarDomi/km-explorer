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
    private token = $state<WriteToken | null>(null);

    get isHeld(): boolean {
        return this.token !== null && !this.token.cancelled;
    }

    acquire(owner: string): WriteToken {
        this.controller?.abort();
        this.controller = new AbortController();
        this.token = new WriteToken(owner, this.controller.signal);
        return this.token;
    }

    tryAcquire(owner: string): WriteToken | null {
        if (this.isHeld) return null;
        return this.acquire(owner);
    }

    release(token: WriteToken): void {
        if (this.token === token) {
            this.token = null;
            this.controller = null;
        }
    }
}
