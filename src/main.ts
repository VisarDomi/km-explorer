import { providerFor } from './provider';
import { init as initActor } from './routes/channel';
import { init as initFavorites } from './routes/favs';
import { init as initSearch } from './routes/search';
import { init as initVideo } from './routes/video';

async function main(): Promise<void> {
    const url = new URL(window.location.href);
    const provider = providerFor(url);
    if (!provider) return;

    const route = provider.recognize(url);
    switch (route.kind) {
        case 'favorites':
            await initFavorites(provider);
            break;
        case 'listing':
            await initSearch(provider, route.sitePage);
            break;
        case 'video':
            await initVideo(provider, route.videoUrl);
            break;
        case 'actor':
            await initActor(provider, route.actorUrl);
            break;
        case 'unsupported':
            break;
    }
}

void main();
