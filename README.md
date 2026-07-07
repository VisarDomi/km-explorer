# What

A repo that makes opening links to KMPlayer easier.

# Why

The original flow was to use a clunky target website, navigate it in clunky ways, and maybe play videos because ios safari doesn't open all types of formats, so half of them couldn't even be seen.

# How

The backend, which is on the pc, downloads all metadata about the videos and puts them in sqlite so that it's easy to query. The frontend then consumes this info instead of hitting the servers for metadata. The frontend also easily copies the correct video links so that when you switch to KMPlayer, you get hit with the use the copied link immediately and can watch all types of formats. Cloudflare is kept work with cloakbrowser and chromium in xvfb, which is a technique to load a headful chrome in ram instead of a headless chrome which gets flagged as a bot.
