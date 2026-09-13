import { ytboob } from '../../../src/provider/ytb';
import { init as favorites } from '../../../src/routes/favs';
import { init as listing } from '../../../src/routes/search';
import { init as actor } from '../../../src/routes/channel';
import { init as video } from '../../../src/routes/video';
import { native, appURL } from './native';
import { installFetch } from './fetch';

const network = installFetch(request => native('fetch', request), requestID => { void native('fetch-cancel',{requestID}).catch(() => {}); });
const documentID = crypto.randomUUID();
let ready = false, rendering = true, initialY = 0, pageActive = true, reloadOnReturn = false;
const save = () => ready ? native('view-save', {document:documentID,position:{path:location.pathname + location.search,y:rendering && !interacted ? initialY : Math.max(0,scrollY)}}).catch(console.error) : Promise.resolve();
(window as any).ytbViewState = {save};
addEventListener('scrollend', () => void save());
addEventListener('pagehide', () => { void save(); pageActive = false; reloadOnReturn = rendering; network.suspend(); });
addEventListener('pageshow', event => {
    pageActive = true; network.resume();
    if (!event.persisted) return;
    // An interrupted initial render cannot continue with its terminated worker.
    // Reload only that incomplete history entry; completed documents use bfcache.
    if (reloadOnReturn) { location.reload(); return; }
    void native('activate',{document:documentID}).then(() => { ready = true; return save(); });
});
let interacted = false;
for (const event of ['touchstart','pointerdown','wheel','keydown']) addEventListener(event, () => { interacted = true; }, {passive:true,once:true});
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function main() {
    const state = await native('init',{document:documentID});
    if (state.redirect) { location.replace(appURL(state.redirect)); return; }
    const route = ytboob.recognize(new URL(location.pathname + location.search,'https://ytboob.com'));
    if (route.kind === 'unsupported') return;
    initialY = state.position?.y ?? 0;
    // Checkpoint the destination independently of slow/failed related metadata.
    // Keep the old offset until rendering or user input supplies a new one.
    ready = !state.resumeReader;
    void save();
    let failure: unknown;
    try {
        switch (route.kind) {
            case 'favorites': await favorites(ytboob); break;
            case 'listing': await listing(ytboob,route.sitePage); break;
            case 'actor': await actor(ytboob,route.actorUrl); break;
            case 'video': await video(ytboob,route.videoUrl); break;
        }
    } catch (error) { failure = error; }
    if (!pageActive) return;
    await frame(); await frame(); await frame();
    if (state.position && !interacted) scrollTo(0,state.position.y);
    rendering = false;
    if (state.resumeReader) {
        // Preserve the library document underneath the resumed video for Safari Back.
        const link = document.createElement('a'); link.href = appURL(state.resumeReader); link.hidden = true;
        document.body.append(link); link.click(); link.remove(); return;
    }
    ready = true; await save();
    if (failure) throw failure;
}
void main().catch(error => { console.error(error); if (!document.body.textContent?.trim()) document.body.textContent = 'Could not load Ytb. Reopen to retry.'; });
