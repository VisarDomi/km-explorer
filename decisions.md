# Decisions

## Actor cache invalidation is data-driven, not time-based

Actor cache entries never expire on a timer. The only thing that can invalidate an actor's cache is a new video being scraped that references that actor. `setCachedDetail` atomically writes the video detail and marks its actors dirty. The backfill script consumes the dirty set — nothing else does.

Why: A 24h TTL caused the backfill to re-fetch all 21k actors every day (4h of WordPress API calls) regardless of whether anything changed. Most days only a handful of actors have new content.

## Live server reads are pure — no background refresh

`getActorVideos` serves from cache and never refreshes existing entries. The only write it performs is a one-time cold-fill for actors encountered for the first time. Cache freshness is the backfill script's responsibility, not the request path's.

Why: The old fire-and-forget `refreshActor` on every cache hit was a hidden write path that raced with the backfill and hammered the upstream API on every user request.

## Video detail cache is infinite

Once a video's detail (videoSrc, actors) is scraped, it's cached forever. Video content on the upstream site doesn't change after publishing.

## Typesense pagination is parallelized

The backfill fetches Typesense pages 50 at a time. Typesense runs on localhost so there's no reason to be sequential.

## External API requests stay sequential with delays

Requests to ytboob.com (video scraping at 500ms delay, actor WP API) are intentionally sequential and throttled. Only Typesense (localhost) gets parallel treatment.

## Ownership pattern

One writer per data path. `dirty_actors` has one writer (`setCachedDetail` transaction) and one consumer (`backfillActorCache`). No shared mutable state between the live server and the cron script except through the database, and each table has clear ownership of who writes and who reads.

## No image domain allowlist

The image proxy accepts any domain. The backend is LAN-only so there's no open-relay risk, and upstream CDN domains change unpredictably — maintaining an allowlist would just cause breakage.

## Image fallback to WP sized variant

If the original image URL 404s, the proxy retries with a `-320x180` suffix before the extension. Some upstream CDN configs block the original but serve the WP thumbnail variant.

## Cloudflare cookie TTL is 30 minutes

Solved `cf_clearance` cookies are cached in-memory for 30 minutes. Cloudflare rotates them frequently enough that longer caching causes stale-cookie blocks.

## Cloudflare solve uses a visible browser

Playwright launches with `headless: false` because Cloudflare's challenge detection fingerprints headless mode and blocks it.

## WP REST API returns 400 past the last page

The WordPress REST API returns HTTP 400 (not an empty page) when requesting a page number beyond the last. Actor video pagination treats 400 as "end of results" rather than an error.

## Backfill clears dirty actors in batches

Dirty actors are cleared from the database every 10 actors during the backfill loop, not at the end. If the process crashes mid-run, already-completed actors won't be re-fetched on the next run.
