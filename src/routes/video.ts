import type { Provider } from '../provider';
import { fetchActorVideos, getCachedActorVideos } from '../core/actor-videos';
import { getDetail, putDetail } from '../storage/db';
import { startInit } from '../ui/shell';
import { createVideoCard } from '../ui/video-card';
import { addVideoScrubbing } from '../ui/video-gesture';
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
    addVideoScrubbing(video);

    const controls = document.createElement('div');
    controls.className = 'ke-video-controls';

    const time = document.createElement('div');
    time.className = 'ke-time-display';
    time.textContent = '00:00.000 / 00:00.000';

    const progress = document.createElement('div');
    progress.className = 'ke-progress-bar';
    progress.setAttribute('role', 'slider');
    progress.setAttribute('aria-label', 'Video progress');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '0');
    progress.setAttribute('aria-valuenow', '0');

    const fill = document.createElement('div');
    fill.className = 'ke-progress-fill';
    progress.appendChild(fill);

    const buttons = document.createElement('div');
    buttons.className = 'ke-player-buttons';

    const play = document.createElement('button');
    play.className = 'ke-player-btn';
    play.textContent = '\u23f8\ufe0f';
    play.setAttribute('aria-label', 'Pause');
    play.addEventListener('click', () => {
        if (video.paused) {
            void video.play();
        } else {
            video.pause();
        }
    });
    video.addEventListener('play', () => {
        play.textContent = '\u23f8\ufe0f';
        play.setAttribute('aria-label', 'Pause');
    });
    video.addEventListener('pause', () => {
        play.textContent = '\u25b6\ufe0f';
        play.setAttribute('aria-label', 'Play');
    });

    const mute = document.createElement('button');
    mute.className = 'ke-player-btn';
    mute.textContent = '\ud83d\udd07';
    mute.setAttribute('aria-label', 'Unmute');
    mute.addEventListener('click', () => {
        video.muted = !video.muted;
        mute.textContent = video.muted ? '\ud83d\udd07' : '\ud83d\udd0a';
        mute.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    });

    const updateTimeline = (): void => {
        const duration = Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : 0;
        const currentTime = Number.isFinite(video.currentTime)
            ? video.currentTime
            : 0;
        const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;
        time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
        fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        progress.setAttribute('aria-valuemax', String(duration));
        progress.setAttribute('aria-valuenow', String(currentTime));
    };

    progress.addEventListener('pointerdown', event => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        const bounds = progress.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        video.currentTime = duration * ratio;
    });
    video.addEventListener('loadedmetadata', updateTimeline);
    video.addEventListener('durationchange', updateTimeline);
    video.addEventListener('timeupdate', updateTimeline);
    video.addEventListener('seeked', updateTimeline);
    updateTimeline();

    buttons.append(play, mute);
    controls.append(time, progress, buttons);

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

    return { root, video };
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000';
    const milliseconds = Math.floor((seconds % 1) * 1000)
        .toString()
        .padStart(3, '0');
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60)
        .toString()
        .padStart(2, '0');
    const remaining = (total % 60).toString().padStart(2, '0');
    return hours > 0
        ? `${hours.toString().padStart(2, '0')}:${minutes}:${remaining}.${milliseconds}`
        : `${minutes}:${remaining}.${milliseconds}`;
}

function renderActorGrid(
    videos: VideoStub[],
    selectedUrl: string,
    provider: Provider,
): void {
    const grid = document.getElementById('ke-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (const video of videos) {
        const selected = sameProviderPage(video.pageUrl, selectedUrl);
        const card = createVideoCard(video, selected => {
            window.location.replace(selected.pageUrl);
        }, provider, { disabled: selected });
        if (selected) {
            card.classList.add('selected');
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
        renderActorGrid(cached, videoUrl, provider);
    }

    const fresh = await fetchActorVideos(provider, actor.url);
    renderActorGrid(fresh, videoUrl, provider);
}
