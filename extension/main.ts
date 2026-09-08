import { providerFor } from '../src/provider';
import { init as initActor } from '../src/routes/channel';
import { init as initFavorites } from '../src/routes/favs';
import { init as initSearch } from '../src/routes/search';
import { init as initVideo } from '../src/routes/video';

type Boot = { entries: number; startedAt: number; readyAt?: number; error?: string };
const scope = window as typeof window & { __kmExtensionBoot?: Boot };
const url = new URL(location.href);
const provider = providerFor(url);
const route = provider?.recognize(url);

// Route ownership first. No takeover, worker or storage on unsupported pages.
if (provider && route && route.kind !== 'unsupported') {
    if (scope.__kmExtensionBoot) {
        scope.__kmExtensionBoot.entries++;
    } else {
        const boot: Boot = { entries: 1, startedAt: performance.now() };
        Object.defineProperty(scope, '__kmExtensionBoot', { value: boot });
        // Every shared route begins with the synchronous UI takeover, then yields
        // to the same worker-backed storage/provider/backup code as the userscript.
        const task = route.kind === 'favorites' ? initFavorites(provider)
            : route.kind === 'listing' ? initSearch(provider, route.sitePage)
            : route.kind === 'video' ? initVideo(provider, route.videoUrl)
            : initActor(provider, route.actorUrl);
        void task.then(() => { boot.readyAt = performance.now(); }, error => {
            boot.error = String(error);
            console.error(error);
        });
    }
}
