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
