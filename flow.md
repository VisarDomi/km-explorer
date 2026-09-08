# Gold Standard Flow

1. `/` → all Favorites in one grid → client page 0
2. `/page/2/` → client listing page 1 → scroll to provider page 2 position
3. Client pagination → red Favs at 0 → listing pages map to their first provider URLs
4. Listing scroll → `scrollend` immediately sends the position to the storage worker; IndexedDB saving remains asynchronous, without a 100ms delay
5. Thumbnail click → immediately navigate to its existing provider video URL; no detail fetch or clipboard work
6. Video page → full-width control-free video → app controls + horizontal scrubbing → single actor's videos
7. Destination resolves its own source from IndexedDB or its provider page → play; media failure shows Copy over the video, and only a tap copies
8. Actor-video card click → immediately `location.replace()` its provider video URL
9. Repeat video replacements → one Back swipe returns to the original Favorites/listing bfcache entry
10. bfcache restore → existing DOM and viewport remain → refresh selected-card highlight; no thumbnail-resolution worker to restart
11. IndexedDB serves cached catalog/detail data on demand → Favorite toggles persist; small selected-card writes do not gate navigation
12. Provider interface owns routes, pagination mapping, listing/detail/actor fetching, and media extraction
