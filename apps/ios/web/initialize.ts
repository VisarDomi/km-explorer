import { compute } from './transport';
let initializing: Promise<void> | undefined;
export function initializeStorage(): Promise<void> {
    if (!initializing) {
        initializing = (async () => {
            if (!await compute<boolean>('ready')) await compute('migrate', {});
        })();
        void initializing.catch(() => { initializing = undefined; });
    }
    return initializing;
}
