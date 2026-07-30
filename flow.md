# Gold Standard Flow

1. `/` → all Favorites in one grid → client page 0
2. `/page/2/` → client listing page 1 → scroll to provider page 2 position
3. Client pagination → red Favs at 0 → listing pages map to their first provider URLs
4. Listing scroll → `scrollend` saves position
5. Ready card click → copy media URL → hard-nav to its existing provider video URL
6. Video page → full-width control-free video → app controls + horizontal scrubbing → single actor's videos
7. Video attempts playback whether or not Safari can play it; media URL was always copied
8. Actor-video card click → copy media URL → `location.replace()` its provider video URL
9. Repeat video replacements → one Back swipe returns to the original Favorites/listing bfcache entry
10. bfcache restore → DOM, viewport, and ready cards remain → restart idempotent card cache worker
11. IndexedDB serves cached data → background work fills missing data → Favorite toggles update `/`
12. Provider interface owns routes, pagination mapping, listing/detail/actor fetching, and media extraction
