import { compute } from '../core/compute/transport';
let initializing: Promise<void> | undefined;
async function migrate(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (await compute<boolean>('ready')) return;
    const raw: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && (key === 'km-explorer-favorites-v1' || key === 'ke-card-highlight' || key.startsWith('ke-scroll'))) {
            const value = localStorage.getItem(key);
            if (value !== null) raw[key] = value;
        }
        if (index % 25 === 24) await new Promise(resolve => setTimeout(resolve, 0));
    }
    await compute('migrate', raw);
}
export function initializeStorage(): Promise<void> {
    if (!initializing) { initializing = migrate(); void initializing.catch(() => { initializing = undefined; }); }
    return initializing;
}
