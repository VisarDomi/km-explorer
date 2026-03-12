<script lang="ts">
    import type { VideoStub } from '$lib/types.js';
    import VideoCard from './VideoCard.svelte';

    interface Props {
        videos: VideoStub[];
    }

    let { videos }: Props = $props();
</script>

<div class="video-grid">
    {#each videos as video (video.id)}
        <VideoCard {video} />
    {/each}
</div>

<style>
.video-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0;
    padding: 0;
}

@media (min-width: 768px) {
    .video-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}
</style>
