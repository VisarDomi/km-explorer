// Native metadata/backup transport. Media continues to stream directly in WebKit.
export function installFetch(send: (request: unknown) => Promise<any>, cancel: (requestID: string) => void) {
    const original = globalThis.fetch.bind(globalThis);
    let active = true;
    const pending = new Set<(reason: unknown) => void>();
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (!request.url.startsWith('https://')) return original(input, init);
        if (!active) throw new DOMException('Document suspended', 'AbortError');
        request.signal.throwIfAborted();
        const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.text();
        const requestID = crypto.randomUUID();
        let rejectAbort!: (reason: unknown) => void;
        const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
        const stop = (reason: unknown) => { cancel(requestID); rejectAbort(reason); };
        const abort = () => stop(request.signal.reason);
        pending.add(stop);
        request.signal.addEventListener('abort', abort, {once:true});
        try {
            if (!active) throw new DOMException('Document suspended', 'AbortError');
            request.signal.throwIfAborted();
            const result = await Promise.race([send({ requestID, url: request.url, method: request.method,
                headers: Object.fromEntries(request.headers), referrer: request.referrer, body }), interrupted]);
            request.signal.throwIfAborted();
            const bytes = Uint8Array.from(atob(result.body), c => c.charCodeAt(0));
            return new Response([204,205,304].includes(result.status) ? null : bytes, { status: result.status, headers: result.headers });
        } finally { request.signal.removeEventListener('abort', abort); pending.delete(stop); }
    };
    return {
        suspend() { active = false; for (const stop of pending) stop(new DOMException('Document suspended', 'AbortError')); },
        resume() { active = true; }
    };
}
