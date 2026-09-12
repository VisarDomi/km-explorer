import { compute } from './transport';
let initializing: Promise<void> | undefined;
export function initializeStorage(): Promise<void> {
    return initializing ??= (async () => {
        if (!await compute<boolean>('ready')) await compute('migrate', {});
    })();
}
