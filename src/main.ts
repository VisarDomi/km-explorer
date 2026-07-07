import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { init as initChannel } from './routes/channel';

async function main(): Promise<void> {
    const { pathname } = window.location;

    const pageMatch = pathname.match(/^\/page\/(\d+)\/$/);
    if (pageMatch) {
        void initSearch(parseInt(pageMatch[1], 10));
        return;
    }

    if (pathname.startsWith('/favs')) {
        void initHome();
        return;
    }

    if (pathname.startsWith('/actor/')) {
        void initChannel(pathname);
        return;
    }

    // / → listing page 1
    void initSearch(1);
}

void main();
