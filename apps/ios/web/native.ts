export async function native(command: string, args: unknown = {}): Promise<any> {
    return JSON.parse(await (window as any).webkit.messageHandlers.ytb.postMessage({command, args}));
}
// Keep real document navigation and replace semantics within the app origin.
export function appURL(raw: string): string {
    const url = new URL(raw, 'https://ytboob.com');
    if (url.origin !== 'https://ytboob.com') throw new Error('Unsupported Ytb destination');
    return url.pathname + url.search;
}
export async function copyText(text: string): Promise<void> { await native('clipboard', {text}); }
