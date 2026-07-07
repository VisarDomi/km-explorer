# Gold Standard Flow

1. https://ytboob.com/ → listing page 1 (600/page, pagination top+bottom, newest first)
2. Scroll → scrollend saves position → bfcache restores on back
3. /page/2/ → listing page 2 (site page 21, client page 1 still)
4. Click pagination 3 → soft-nav to client page 3 → URL: /page/41/
5. /favs → favorites (25/page, import/export at bottom, Home button to go back)
6. Favs: Import/Merge → paste IDs → adds → fetches thumbnails + detail
7. Card click → copy video src → hard-nav to actor → channel page
8. Channel: click → copy only → back via bfcache
9. Refresh → IndexedDB serves cached → background fetch new videos
10. Fav toggle on any card → adds/removes from favorites store
