import { ytboob } from '../../../src/provider/ytb';
import { init as favorites } from '../../../src/routes/favs';
import { init as listing } from '../../../src/routes/search';
import { init as actor } from '../../../src/routes/channel';
import { init as video } from '../../../src/routes/video';
import { native, appURL } from './native';
import { installFetch } from './fetch';

installFetch(request => native('fetch', request));
const documentID = crypto.randomUUID();
let ready = false;
const save = () => ready ? native('view-save', {document:documentID,position:{path:location.pathname,y:Math.max(0,scrollY)}}).catch(console.error) : Promise.resolve();
(window as any).ytbViewState = {save};
addEventListener('scrollend', () => void save());
addEventListener('pagehide', () => void save());
addEventListener('pageshow', event => { if (event.persisted) void native('activate',{document:documentID}).then(() => { ready = true; return save(); }); });
let interacted = false;
for (const event of ['touchstart','pointerdown','wheel']) addEventListener(event, () => { interacted = true; }, {passive:true,once:true});
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function main() {
    const state = await native('init',{document:documentID});
    if (state.redirect) { location.replace(appURL(state.redirect)); return; }
    const route = ytboob.recognize(new URL(location.pathname + location.search,'https://ytboob.com'));
    // A bootstrap library must never overwrite the saved video checkpoint.
    switch (route.kind) {
        case 'favorites': await favorites(ytboob); break;
        case 'listing': await listing(ytboob,route.sitePage); break;
        case 'actor': await actor(ytboob,route.actorUrl); break;
        case 'video': await video(ytboob,route.videoUrl); break;
    }
    await frame(); await frame(); await frame();
    if (state.position && !interacted) scrollTo(0,state.position.y);
    if (state.resumeReader) {
        // Preserve the library document underneath the resumed video for Safari Back.
        const link = document.createElement('a'); link.href = appURL(state.resumeReader); link.hidden = true;
        document.body.append(link); link.click(); link.remove(); return;
    }
    ready = true; await save();
}
void main().catch(error => { console.error(error); if (!document.body.textContent?.trim()) document.body.textContent = 'Could not load Ytb. Reopen to retry.'; });
