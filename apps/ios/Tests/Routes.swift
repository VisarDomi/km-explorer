// Run after concatenating Ytb/Models.swift; Foundation-only checks on the Mac.
for path in ["/", "/?q=fixture", "/page/2/", "/page/0002/", "/page/10?mode=test", "/actor/a%2Fb/"] {
    assert(ViewPosition.route(path) == "library:" + path, "Provider library route rejected")
}
for path in ["/video-one/", "/video-one/?variant=test"] {
    assert(ViewPosition.route(path) == "video:" + path, "Provider video route rejected")
}
for path in ["/favs", "/favs/", "/page/1/", "/page/0/", "https://ytboob.com/video/", "//elsewhere/video", "/a/b/c"] {
    assert(ViewPosition.route(path) == nil, "Unsupported route accepted")
}
print("PASS: native routes preserve provider queries/page parsing and reject unsupported destinations")
