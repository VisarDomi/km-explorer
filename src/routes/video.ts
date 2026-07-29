import type { Provider } from '../provider';
import { fetchActorVideos, getCachedActorVideos } from '../core/actor-videos';
import { getDetail, isFav, putDetail, toggleFav } from '../storage/db';
import { startInit } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import type { VideoDetail, VideoStub } from '../types';

function sameProviderPage(left: string, right: string): boolean {
    const leftUrl = new URL(left, location.origin);
    const rightUrl = new URL(right, location.origin);
    return leftUrl.hostname === rightUrl.hostname
        && leftUrl.pathname.replace(/\/$/, '') === rightUrl.pathname.replace(/\/$/, '');
}

async function loadDetail(provider: Provider, videoUrl: string): Promise<VideoDetail> {
    const cached = await getDetail(videoUrl);
    if (cached) return cached;
    const detail = await provider.fetchVideoDetail(videoUrl);
    await putDetail(videoUrl, detail);
    return detail;
}

function createPlayer(videoSrc: string): {
    root: HTMLElement;
    video: HTMLVideoElement;
    setSelected: (selected: VideoStub) => void;
} {
    const root = document.createElement('main');
    root.className = 'ke-video-page';

    const video = document.createElement('video');
    video.className = 'ke-video';
    video.src = videoSrc;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.preload = 'auto';

    const controls = document.createElement('div');
    controls.className = 'ke-video-controls';

    const play = document.createElement('button');
    play.className = 'ke-control-btn';
    play.textContent = 'Pause';
    play.addEventListener('click', () => {
        if (video.paused) {
            void video.play();
        } else {
            video.pause();
        }
    });
    video.addEventListener('play', () => {
        play.textContent = 'Pause';
    });
    video.addEventListener('pause', () => {
        play.textContent = 'Play';
    });

    const mute = document.createElement('button');
    mute.className = 'ke-control-btn';
    mute.textContent = 'Unmute';
    mute.addEventListener('click', () => {
        video.muted = !video.muted;
        mute.textContent = video.muted ? 'Unmute' : 'Mute';
    });

    const copy = document.createElement('button');
    copy.className = 'ke-control-btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(videoSrc);
        copy.textContent = 'Copied';
        setTimeout(() => {
            copy.textContent = 'Copy';
        }, 1200);
    });

    const favorite = document.createElement('button');
    favorite.className = 'ke-control-btn';
    favorite.textContent = 'Favorite';
    favorite.disabled = true;

    const home = document.createElement('button');
    home.className = 'ke-control-btn';
    home.textContent = 'Home';
    home.addEventListener('click', () => {
        window.location.href = '/';
    });

    controls.append(play, mute, copy, favorite, home);

    const status = document.createElement('div');
    status.className = 'ke-video-status';
    video.addEventListener('error', () => {
        status.textContent = 'Safari could not play this video. The media URL is ready for KMPlayer.';
    });

    const heading = document.createElement('h1');
    heading.className = 'ke-section-title';
    heading.textContent = 'More from this actor';

    const grid = document.createElement('div');
    grid.id = 'ke-grid';
    grid.className = 'ke-grid';
    grid.innerHTML = '<div class="ke-loading">Loading...</div>';

    root.append(video, controls, status, heading, grid);

    return {
        root,
        video,
        setSelected: selected => {
            favorite.disabled = false;
            void isFav(selected.id).then(active => {
                favorite.textContent = active ? 'Unfavorite' : 'Favorite';
                favorite.classList.toggle('active', active);
            });
            favorite.onclick = async () => {
                const active = await toggleFav(selected.id);
                favorite.textContent = active ? 'Unfavorite' : 'Favorite';
                favorite.classList.toggle('active', active);
            };
        },
    };
}

function renderActorGrid(
    videos: VideoStub[],
    selectedUrl: string,
    provider: Provider,
    setSelected: (selected: VideoStub) => void,
): void {
    const grid = document.getElementById('ke-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const video of videos) {
        const card = createVideoCard(video, selected => {
            window.location.replace(selected.pageUrl);
        }, provider);
        if (sameProviderPage(video.pageUrl, selectedUrl)) {
            card.classList.add('selected');
            setSelected(video);
        }
        grid.appendChild(card);
    }

    if (videos.length === 0) {
        grid.innerHTML = '<div class="ke-empty">No actor videos found</div>';
    }
}

export async function init(provider: Provider, videoUrl: string): Promise<void> {
    startInit();
    const detail = await loadDetail(provider, videoUrl);
    const actor = detail.actors[0];
    if (!actor) {
        document.body.innerHTML = '<div class="ke-empty">No actor found for this video</div>';
        return;
    }

    const player = createPlayer(detail.videoSrc);
    document.body.appendChild(player.root);
    void player.video.play().catch(() => {
        // The controls remain available when autoplay is rejected.
    });

    const cached = await getCachedActorVideos(provider, actor.url);
    if (cached) {
        renderActorGrid(cached, videoUrl, provider, player.setSelected);
    }

    const fresh = await fetchActorVideos(provider, actor.url);
    renderActorGrid(fresh, videoUrl, provider, player.setSelected);
}
