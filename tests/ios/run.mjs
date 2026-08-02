#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    createController,
    createReporter,
    createSession,
    parseSelection,
    runBuildSteps,
    sleep,
} from "userscript-ios-test/controller";

const root = resolve(import.meta.dirname, "../..");
const config = JSON.parse(
    await readFile(resolve(root, "tests/ios/config.json"), "utf8"),
);
const selection = parseSelection(process.argv.slice(2), { defaultTest: "full" });
const smoke = selection.test === "smoke";
const homeUrl = "https://ytboob.com/";
const listingUrl = "https://ytboob.com/page/2/";
const playableUrl = "https://ytboob.com/purple-see-through-try-on-haul-4k-017/";
const unsupportedUrl = "https://ytboob.com/great-try-on-haul/";
const fixturePrefix = "__km_ios_cache_";
const fixtureIdBase = 990_000_000;
const fixtureCount = 4;
const controller = createController({
    root,
    name: config.name,
    settleMs: 350,
    commandTimeoutMs: Number(process.env.IOS_TEST_COMMAND_TIMEOUT_MS ?? 120_000),
    clientTimeoutMs: Number(process.env.IOS_TEST_CLIENT_TIMEOUT_MS ?? 60_000),
    connectionTimeoutMs: Number(process.env.IOS_TEST_CONNECTION_TIMEOUT_MS ?? 15_000),
});
const session = createSession({
    controller,
    sourceLabel: "km-explorer.test.user.js",
});
const { results, check, skip } = createReporter();

let bundle = "";
let favoritesSnapshot = null;
let scrollSnapshot = null;
let cardHighlightSnapshot = null;
let fixtureCreated = false;

function assert(condition, message, details) {
    if (condition) return;
    const suffix = details === undefined
        ? ""
        : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
}

async function command(code, options) {
    return session.command(code, options);
}

async function inject(before = "") {
    await command(`
        ${before}
        globalThis.__kmSuiteDiagnostics = {
            fetches: [],
            databaseOpens: [],
            errors: [],
            injectedAt: Date.now(),
        };
        const suiteOpen = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) {
            const entry = {
                name: String(args[0]),
                version: args[1] ?? null,
                startedAt: Date.now(),
                outcome: "pending",
            };
            globalThis.__kmSuiteDiagnostics.databaseOpens.push(entry);
            const request = suiteOpen.apply(this, args);
            request.addEventListener("success", () => {
                entry.outcome = "success";
                entry.actualVersion = request.result.version;
            });
            request.addEventListener("error", () => {
                entry.outcome = "error";
                entry.error = String(request.error);
            });
            request.addEventListener("blocked", () => {
                entry.outcome = "blocked";
            });
            request.addEventListener("upgradeneeded", () => {
                entry.outcome = "upgrading";
            });
            return request;
        };
        const suiteFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (...args) => {
            const entry = {
                url: String(typeof args[0] === "string" ? args[0] : args[0]?.url),
                startedAt: Date.now(),
                outcome: "pending",
            };
            globalThis.__kmSuiteDiagnostics.fetches.push(entry);
            try {
                const response = await suiteFetch(...args);
                entry.outcome = "resolved";
                entry.status = response.status;
                return response;
            } catch (error) {
                entry.outcome = "rejected";
                entry.error = String(error);
                throw error;
            }
        };
        addEventListener("unhandledrejection", event => {
            globalThis.__kmSuiteDiagnostics.errors.push(String(event.reason));
        });
        const source = ${JSON.stringify(bundle)};
        new Function(
            source + String.fromCharCode(10) +
            "//# sourceURL=km-explorer.test.user.js"
        )();
        globalThis.__kmSuiteWakeLock = await navigator.wakeLock
            ?.request("screen")
            .catch(() => null);
        return source.length;
    `);
}

async function navigate(url) {
    return session.navigate(url, {
        matches: (client, expectedText) => {
            const actual = new URL(client.href);
            const expected = new URL(expectedText);
            return actual.hostname === expected.hostname
                && actual.pathname === expected.pathname
                && actual.search === expected.search;
        },
    });
}

async function replaceNavigate(url) {
    const before = await controller.state();
    const known = new Set(before.clients.map(client => client.client));
    await command(`
        location.replace(${JSON.stringify(url)});
        return true;
    `, { expectResult: false });
    return session.waitForNavigation(
        client => !known.has(client.client)
            && controller.navigationMatches(client.href, url),
        `replacement navigation to ${url}`,
    );
}

async function snapshotFavorites() {
    return command(`
        return await new Promise((resolve, reject) => {
            const open = indexedDB.open("km-explorer");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const request = open.result.transaction("favorites", "readonly")
                    .objectStore("favorites").getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            };
        });
    `);
}

async function restoreFavorites(items) {
    return command(`
        const items = ${JSON.stringify(items)};
        return await new Promise((resolve, reject) => {
            const open = indexedDB.open("km-explorer");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const transaction = open.result.transaction("favorites", "readwrite");
                const store = transaction.objectStore("favorites");
                store.clear();
                for (const item of items) store.put(item);
                transaction.oncomplete = () => resolve(items.length);
                transaction.onerror = () => reject(transaction.error);
            };
        });
    `);
}

async function homeSnapshot() {
    return command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 240; attempt++) {
            const grid = document.querySelector("#ke-grid");
            const active = document.querySelector(".ke-page-btn.active");
            if (grid && active) break;
            await wait(250);
        }
        const cards = [...document.querySelectorAll("#ke-grid .ke-card")];
        const favorites = await new Promise((resolve, reject) => {
            const open = indexedDB.open("km-explorer");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const request = open.result.transaction("favorites", "readonly")
                    .objectStore("favorites").getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            };
        });
        favorites.sort((left, right) => right.savedAt - left.savedAt);
        return {
            href: location.href,
            cardIds: cards.map(card => card.dataset.videoId),
            favoriteIds: favorites.map(item => item.id),
            activePage: document.querySelector(".ke-page-btn.active")?.textContent ?? null,
            paginationBars: document.querySelectorAll(".ke-pagination").length,
            numberedPages: [...document.querySelectorAll(".ke-pagination:first-of-type .ke-page-btn")]
                .map(button => button.textContent),
        };
    `);
}

async function listingSnapshot({ ready = 0 } = {}) {
    return command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 360; attempt++) {
            const cards = document.querySelectorAll("#ke-grid .ke-card");
            const ready = document.querySelectorAll("#ke-grid .ke-card[data-video-src]");
            if (cards.length === 600 && ready.length >= ${ready}) break;
            await wait(250);
        }
        const target = document.querySelector("#ke-30");
        return {
            href: location.href,
            cards: document.querySelectorAll("#ke-grid .ke-card").length,
            ready: document.querySelectorAll("#ke-grid .ke-card[data-video-src]").length,
            activePage: document.querySelector(".ke-page-btn.active")?.textContent ?? null,
            paginationBars: document.querySelectorAll(".ke-pagination").length,
            targetTop: target?.getBoundingClientRect().top ?? null,
            savedScroll: localStorage.getItem("ke-scroll/page/2/"),
            scrollY,
            pageZero: [...document.querySelectorAll(".ke-pagination:first-of-type .ke-page-btn")]
                .find(button => button.textContent === "Favs")?.getAttribute("aria-label") ?? null,
            pageOneHref: "/page/2/",
        };
    `);
}

async function videoSnapshot({ waitForOutcome = false } = {}) {
    return command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 360; attempt++) {
            const video = document.querySelector(".ke-video");
            const cards = document.querySelectorAll("#ke-grid .ke-card");
            const outcome = video?.error || (video?.readyState >= 2 && !video.paused);
            if (video?.src && cards.length > 0 && (${waitForOutcome} ? outcome : true)) break;
            await wait(250);
        }
        const video = document.querySelector(".ke-video");
        return {
            href: location.href,
            src: video?.src ?? null,
            muted: video?.muted ?? null,
            paused: video?.paused ?? null,
            nativeControls: video?.controls ?? null,
            readyState: video?.readyState ?? null,
            error: video?.error ? {
                code: video.error.code,
                message: video.error.message,
            } : null,
            scrollY,
            timeText: document.querySelector(".ke-time-display")?.textContent ?? null,
            progressHeight: document.querySelector(".ke-progress-bar")
                ?.getBoundingClientRect().height ?? null,
            buttons: [...document.querySelectorAll(".ke-player-btn")].map(button => ({
                text: button.textContent,
                label: button.getAttribute("aria-label"),
            })),
            actorCards: document.querySelectorAll("#ke-grid .ke-card").length,
            selectedCards: document.querySelectorAll("#ke-grid .ke-card.selected").length,
            selectedDisabled: document.querySelector(".ke-card.selected")
                ?.getAttribute("aria-disabled") ?? null,
            diagnostics: globalThis.__kmSuiteDiagnostics ?? null,
            bodyText: document.body?.innerText?.slice(0, 500) ?? null,
        };
    `);
}

async function snapshotScrollKey() {
    return command(`
        const key = "ke-scroll/page/2/";
        return { key, value: localStorage.getItem(key) };
    `);
}

async function restoreScrollKey(snapshot) {
    return command(`
        const snapshot = ${JSON.stringify(snapshot)};
        if (snapshot.value === null) localStorage.removeItem(snapshot.key);
        else localStorage.setItem(snapshot.key, snapshot.value);
        return true;
    `);
}

async function snapshotCardHighlight() {
    return command(`
        const key = "ke-card-highlight";
        const value = localStorage.getItem(key);
        localStorage.removeItem(key);
        return { key, value };
    `);
}

async function restoreCardHighlight(snapshot) {
    return command(`
        const snapshot = ${JSON.stringify(snapshot)};
        if (snapshot.value === null) localStorage.removeItem(snapshot.key);
        else localStorage.setItem(snapshot.key, snapshot.value);
        return true;
    `);
}

function fixtureSetupSource() {
    return `
        await new Promise((resolve, reject) => {
            const open = indexedDB.open("km-explorer");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const transaction = open.result.transaction(["videos", "details"], "readwrite");
                const videos = transaction.objectStore("videos");
                const details = transaction.objectStore("details");
                for (let index = 0; index < ${fixtureCount}; index++) {
                    videos.delete(String(${fixtureIdBase} + index));
                    details.delete("https://ytboob.com/${fixturePrefix}" + index + "/");
                }
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            };
        });
        globalThis.__kmFixtureDetailCalls = {};
        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (input, init) => {
            const url = new URL(typeof input === "string" ? input : input.url, location.href);
            if (url.hostname === "ts-api.ytboob.com") {
                const body = JSON.parse(init?.body ?? "{}");
                const page = Number(body.searches?.[0]?.page ?? 1);
                const hits = Array.from({ length: page === 1 ? ${fixtureCount} : 0 }, (_, offset) => {
                    const index = (page - 1) * 12 + offset;
                    return {
                        document: {
                            post_id: String(${fixtureIdBase} + index),
                            permalink: "https://ytboob.com/${fixturePrefix}" + index + "/",
                            post_thumbnail: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
                        },
                    };
                });
                return new Response(JSON.stringify({
                    results: [{ found: ${fixtureCount}, hits }],
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            const match = url.pathname.match(/^\\/${fixturePrefix}(\\d+)\\/$/);
            if (match) {
                const index = Number(match[1]);
                const calls = (globalThis.__kmFixtureDetailCalls[index] ?? 0) + 1;
                globalThis.__kmFixtureDetailCalls[index] = calls;
                if (index === 2 && calls === 1) return new Promise(() => {});
                return new Response(
                    '<meta itemprop="contentURL" content="' +
                    (index === 3 ? "https://media.example/" : "https://vidhost.me/") +
                    index + '.mp4">' +
                    '<a href="/actor/km-ios-fixture">Fixture Actor</a>',
                    { status: 200, headers: { "Content-Type": "text/html" } },
                );
            }
            return originalFetch(input, init);
        };
    `;
}

async function cleanupFixture() {
    return command(`
        return await new Promise((resolve, reject) => {
            const open = indexedDB.open("km-explorer");
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const transaction = open.result.transaction(["videos", "details"], "readwrite");
                const videos = transaction.objectStore("videos");
                const details = transaction.objectStore("details");
                for (let index = 0; index < ${fixtureCount}; index++) {
                    videos.delete(String(${fixtureIdBase} + index));
                    details.delete("https://ytboob.com/${fixturePrefix}" + index + "/");
                }
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error);
            };
        });
    `);
}

async function runCacheFixture() {
    console.log("  Cache fixture: creating four deterministic cards");
    await navigate(listingUrl);
    await inject(fixtureSetupSource());
    fixtureCreated = true;

    const initial = await command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 80; attempt++) {
            const ready = document.querySelectorAll(".ke-card[data-video-src]").length;
            if (ready === 2 && globalThis.__kmFixtureDetailCalls?.[2] === 1) break;
            await wait(100);
        }
        window.__kmFixtureRestore = { persisted: null, count: 0 };
        addEventListener("pageshow", event => {
            window.__kmFixtureRestore.persisted = event.persisted;
            window.__kmFixtureRestore.count++;
        });
        return {
            ready: document.querySelectorAll(".ke-card[data-video-src]").length,
            unresolved: document.querySelectorAll(".ke-card:not([data-video-src])").length,
            thirdCalls: globalThis.__kmFixtureDetailCalls?.[2] ?? 0,
        };
    `);
    assert(initial.ready === 2, "Fixture did not stop after two ready cards", initial);
    assert(initial.thirdCalls === 1, "Fixture did not suspend the third detail request", initial);
    console.log("  Cache fixture: freezing after the suspended third card");

    await command(`
        location.href = "https://example.com/?km-cache-fixture=1";
        return true;
    `, { expectResult: false });
    await session.waitForNavigation(
        client => client.href === "https://example.com/?km-cache-fixture=1",
        "cache fixture freeze page",
    );
    await command("history.back(); return true;", { expectResult: false });
    await session.waitForNavigation(
        client => client.href === listingUrl,
        "cache fixture bfcache restore",
    );

    const restored = await command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 80; attempt++) {
            const ready = document.querySelectorAll(".ke-card[data-video-src]").length;
            const calls = globalThis.__kmFixtureDetailCalls?.[2] ?? 0;
            const unavailable = document.querySelectorAll(
                ".ke-card[data-video-unavailable]"
            ).length;
            if (window.__kmFixtureRestore?.persisted === true
                && ready >= 3 && unavailable >= 1 && calls >= 2) break;
            await wait(100);
        }
        return {
            persisted: window.__kmFixtureRestore?.persisted ?? null,
            pageshowCount: window.__kmFixtureRestore?.count ?? 0,
            ready: document.querySelectorAll(".ke-card[data-video-src]").length,
            unresolved: document.querySelectorAll(".ke-card:not([data-video-src])").length,
            firstCalls: globalThis.__kmFixtureDetailCalls?.[0] ?? 0,
            secondCalls: globalThis.__kmFixtureDetailCalls?.[1] ?? 0,
            thirdCalls: globalThis.__kmFixtureDetailCalls?.[2] ?? 0,
            fourthCalls: globalThis.__kmFixtureDetailCalls?.[3] ?? 0,
            unavailable: document.querySelectorAll(
                ".ke-card[data-video-checked][data-video-unavailable][aria-disabled='true']"
            ).length,
        };
    `);
    assert(restored.persisted === true, "Fixture listing did not restore from bfcache", restored);
    assert(restored.thirdCalls >= 2, "Cache worker did not restart the suspended third card", restored);
    assert(restored.ready >= 3, "Restarted cache worker did not resolve the third card", restored);
    assert(restored.unavailable >= 1, "Non-vidhost media was not terminally unavailable", restored);
    assert(restored.fourthCalls === 1, "Unavailable card detail was checked more than once", restored);
    console.log("  Cache fixture: restored worker resolved all four cards");
    await command(`
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let attempt = 0; attempt < 80
            && document.querySelectorAll(".ke-card[data-video-checked]").length
                < ${fixtureCount}; attempt++) await wait(100);
        return document.querySelectorAll(".ke-card[data-video-checked]").length;
    `);
    return { initial, restored };
}

async function main() {
    if (!["full", "smoke", "video", "cache"].includes(selection.test)) {
        throw new Error(`Unknown test "${selection.test}". Expected full, smoke, video, or cache.`);
    }
    if (selection.site && selection.site !== "ytboob") {
        throw new Error(`Unknown site "${selection.site}". Expected ytboob.`);
    }
    if (selection.args.length) {
        throw new Error(`Unknown arguments: ${selection.args.join(" ")}`);
    }

    await session.connect({
        allowedHosts: ["ytboob.com"],
        controlledCode: `
            return Boolean(
                document.querySelector(".ke-grid, .ke-video-page") ||
                globalThis.__kmFixtureDetailCalls
            );
        `,
    });
    runBuildSteps(controller, [
        ["npx", ["tsc", "--noEmit"]],
        ["npx", ["vite", "build"]],
    ]);
    bundle = await readFile(resolve(root, "dist/km-explorer.user.js"), "utf8");

    if (selection.test === "cache") {
        await check(
            ["C1", "C2", "C3", "C4", "C5"],
            "Deterministic bfcache fixture restarts cache and terminally rejects other hosts",
            runCacheFixture,
        );
        return;
    }

    if (selection.test === "video") {
        await navigate(playableUrl);
        await inject();
        await check(["V1", "V2", "V3", "V4", "V5", "A1"], "Known playable video starts muted with the frozen player UI", async () => {
            const state = await videoSnapshot({ waitForOutcome: true });
            assert(state.href === playableUrl, "Video takeover changed the provider URL", state);
            assert(!state.error && state.readyState >= 2 && !state.paused, "Known playable video did not play", state);
            assert(state.muted === true, "Video did not start muted", state);
            assert(state.nativeControls === false, "Native video controls are enabled", state);
            assert(state.scrollY === 0, "Video page auto-scrolled", state);
            assert(state.timeText?.includes(" / "), "Precise time display is missing", state);
            assert(Math.abs(state.progressHeight - 100) <= 1, "Progress bar height changed", state);
            assert(
                state.buttons.map(button => button.label).join("|") === "Pause|Unmute",
                "Player icon controls changed",
                state,
            );
            assert(state.actorCards > 1, "Zoe actor grid did not render", state);
            return state;
        });
        await check(["V3", "V7"], "Player pause and swipe-scrub controls work", async () => {
            const state = await command(`
                const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                const video = document.querySelector(".ke-video");
                video.currentTime = 0;
                await video.play();
                await wait(100);
                const pause = document.querySelector('[aria-label="Pause"]');
                const beforePause = video.paused;
                pause.click();
                await wait(250);
                const paused = video.paused;
                const resume = document.querySelector('[aria-label="Play"]');
                if (resume) {
                    resume.click();
                    await wait(250);
                }
                video.currentTime = 1;
                const touchEvent = (type, touches) => {
                    const event = new Event(type, { bubbles: true, cancelable: true });
                    Object.defineProperty(event, "touches", { value: touches });
                    video.dispatchEvent(event);
                };
                touchEvent("touchstart", [{ clientX: 100, clientY: 50 }]);
                touchEvent("touchmove", [{
                    clientX: 100 + innerWidth / 4,
                    clientY: 50,
                }]);
                const scrubbedTime = video.currentTime;
                touchEvent("touchend", []);
                await wait(250);
                return {
                    beforePause,
                    paused,
                    resumeFound: Boolean(resume),
                    resumed: !video.paused,
                    scrubbedTime,
                    labels: [...document.querySelectorAll(".ke-player-btn")]
                        .map(button => button.getAttribute("aria-label")),
                };
            `);
            assert(state.paused && state.resumed, "Play control did not round-trip", state);
            assert(Math.abs(state.scrubbedTime - 16) < 1, "Video swipe did not scrub 15 seconds", state);
            return state;
        });
        return;
    }

    await navigate(homeUrl);
    favoritesSnapshot = await snapshotFavorites();
    cardHighlightSnapshot = await snapshotCardHighlight();
    await inject();
    await check(["F1", "F2", "F3", "P5"], "Favorites renders as complete client page 0", async () => {
        const state = await homeSnapshot();
        assert(state.href === homeUrl, "Favorites changed the provider Home URL", state);
        assert(state.activePage === "Favs", "Favorites is not active page 0", state);
        assert(state.paginationBars === 2, "Favorites does not have top and bottom navigation", state);
        assert(state.cardIds.length === state.favoriteIds.length, "Favorites grid count differs from its store", state);
        assert(
            state.cardIds.every((id, index) => id === state.favoriteIds[index]),
            "Favorites grid is not newest-first store order",
            state,
        );
        return {
            cards: state.cardIds.length,
            pages: state.numberedPages.length,
        };
    });

    await navigate(listingUrl);
    scrollSnapshot = await snapshotScrollKey();
    await inject();
    await check(["P1", "P2", "P5", "P6", "P9"], "Provider page 2 maps to client page 1 and card 30", async () => {
        const state = await listingSnapshot({ ready: 2 });
        assert(state.cards === 600, "Client listing page did not render 600 cards", state);
        assert(state.activePage === "1", "Client page 1 is not active", state);
        assert(state.paginationBars === 2, "Listing does not have two pagination bars", state);
        assert(state.pageZero === "Favorites", "Page 0 is not Favorites", state);
        if (state.savedScroll === null) {
            assert(state.targetTop !== null && Math.abs(state.targetTop) <= 2, "Provider page 2 target is not at viewport top", state);
        } else {
            assert(
                Math.abs(state.scrollY - Number.parseInt(state.savedScroll, 10)) <= 2,
                "Saved listing position did not take precedence over initial provider position",
                state,
            );
        }
        return state;
    });

    await replaceNavigate("https://example.com/");
    await navigate(playableUrl);
    await inject();
    await check(["V1", "V2", "V3", "V4", "V5", "A1"], "Known playable video starts muted with the frozen player UI", async () => {
        const state = await videoSnapshot({ waitForOutcome: true });
        assert(state.href === playableUrl, "Video takeover changed the provider URL", state);
        assert(!state.error && state.readyState >= 2 && !state.paused, "Known playable video did not play", state);
        assert(state.muted === true, "Video did not start muted", state);
        assert(state.nativeControls === false, "Native video controls are enabled", state);
        assert(state.scrollY === 0, "Video page auto-scrolled", state);
        assert(state.timeText?.includes(" / "), "Precise time display is missing", state);
        assert(Math.abs(state.progressHeight - 100) <= 1, "Progress bar height changed", state);
        assert(
            state.buttons.map(button => button.label).join("|") === "Pause|Unmute",
            "Player icon controls changed",
            state,
        );
        assert(state.actorCards > 1, "Zoe actor grid did not render", state);
        return state;
    });

    if (smoke) {
        skip(["F4", "L1", "C1", "H1", "I1", "R1"], "Full safe regression flow", "smoke mode");
        return;
    }

    await navigate(listingUrl);
    await inject();
    await check(["F4"], "Favorite toggle changes and restores its original membership", async () => {
        const state = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const button = document.querySelector(".ke-fav-toggle");
            for (let attempt = 0; attempt < 80 && !button.classList.contains("active")
                && button.textContent === "♡"; attempt++) await wait(50);
            const before = button.classList.contains("active");
            button.click();
            for (let attempt = 0; attempt < 80
                && button.classList.contains("active") === before; attempt++) await wait(50);
            const changed = button.classList.contains("active");
            button.click();
            for (let attempt = 0; attempt < 80
                && button.classList.contains("active") !== before; attempt++) await wait(50);
            return {
                before,
                changed,
                restored: button.classList.contains("active"),
            };
        `);
        assert(state.changed !== state.before, "Favorite membership did not change", state);
        assert(state.restored === state.before, "Favorite membership was not restored", state);
        return state;
    });

    await check(["L1", "L2", "L3", "O1", "O2", "O4"], "Ready card copies, hard-navigates, and Back restores listing bfcache position", async () => {
        const selected = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 240
                && !document.querySelector(".ke-card[data-video-src]"); attempt++) await wait(250);
            const marker = document.querySelector("#ke-100");
            marker.scrollIntoView();
            dispatchEvent(new Event("scrollend"));
            await wait(150);
            const card = document.querySelector(".ke-card[data-video-src]");
            window.__kmSuiteBack = { copied: null, persisted: null };
            addEventListener("pageshow", event => {
                window.__kmSuiteBack.persisted = event.persisted;
            });
            try {
                Object.defineProperty(navigator.clipboard, "writeText", {
                    configurable: true,
                    value: async value => { window.__kmSuiteBack.copied = value; },
                });
            } catch {}
            const value = {
                id: card.dataset.videoId,
                src: card.dataset.videoSrc,
                scrollY,
                ready: document.querySelectorAll(".ke-card[data-video-src]").length,
            };
            return value;
        `);
        await command(`
            document.querySelector('.ke-card[data-video-id="${selected.id}"]').click();
            return true;
        `, { expectResult: false });
        await session.waitForNavigation(client => {
            const path = new URL(client.href).pathname;
            return !path.startsWith("/page/") && path !== "/";
        }, "selected listing video");
        await inject();
        const opened = await videoSnapshot();
        assert(opened.src, "Selected card did not reach a video page", opened);

        await command("history.back(); return true;", { expectResult: false });
        await session.waitForNavigation(client => new URL(client.href).pathname === "/page/2/", "Back to listing");
        const restored = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 80
                && window.__kmSuiteBack?.persisted !== true; attempt++) await wait(100);
            return {
                href: location.href,
                scrollY,
                copied: window.__kmSuiteBack?.copied ?? null,
                persisted: window.__kmSuiteBack?.persisted ?? null,
                cards: document.querySelectorAll(".ke-card").length,
                ready: document.querySelectorAll(".ke-card[data-video-src]").length,
                copiedVisible: [...document.querySelectorAll(".ke-copied-overlay")]
                    .filter(overlay => getComputedStyle(overlay).display !== "none").length,
                busy: document.querySelectorAll(".ke-card[data-card-busy]").length,
                highlighted: [...document.querySelectorAll(".ke-card.ke-returned-card")]
                    .map(card => ({ id: card.dataset.videoId, pageUrl: card.dataset.videoPageUrl })),
            };
        `);
        assert(restored.persisted === true, "Listing did not return through bfcache", restored);
        assert(Math.abs(restored.scrollY - selected.scrollY) <= 2, "Listing viewport was not restored", { selected, restored });
        assert(restored.copied === selected.src, "Card did not attempt to copy its own media URL", { selected, restored });
        assert(restored.cards === 600, "Restored listing DOM changed", restored);
        assert(restored.copiedVisible === 0, "Restored card still displays the transient Copied overlay", restored);
        assert(restored.busy === 0, "Restored card remained internally busy and unclickable", restored);
        assert(restored.highlighted.length === 1 && restored.highlighted[0].id === selected.id, "Back did not highlight exactly the card that initiated navigation", { selected, restored });

        await session.reload(listingUrl);
        await inject(`
            globalThis.__kmHighlightScrolls = [];
            const suiteScrollIntoView = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function (options) {
                if (this.classList?.contains("ke-returned-card")) {
                    globalThis.__kmHighlightScrolls.push({
                        id: this.dataset.videoId,
                        block: options?.block ?? null,
                    });
                }
                return suiteScrollIntoView.call(this, options);
            };
        `);
        const refreshed = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 360
                && document.querySelectorAll(".ke-card").length < 600; attempt++) await wait(250);
            for (let attempt = 0; attempt < 40; attempt++) {
                const card = document.querySelector(".ke-card.ke-returned-card");
                if (card) {
                    const rect = card.getBoundingClientRect();
                    const center = rect.top + rect.height / 2;
                    if (Math.abs(center - innerHeight / 2) <= 2) break;
                }
                await wait(50);
            }
            const highlighted = [...document.querySelectorAll(".ke-card.ke-returned-card")];
            const rect = highlighted[0]?.getBoundingClientRect();
            return {
                count: highlighted.length,
                id: highlighted[0]?.dataset.videoId ?? null,
                center: rect ? rect.top + rect.height / 2 : null,
                viewportCenter: innerHeight / 2,
                scrollY,
                scrollCalls: globalThis.__kmHighlightScrolls ?? [],
            };
        `);
        assert(refreshed.count === 1 && refreshed.id === selected.id, "Reload did not restore exactly the saved card highlight", { selected, refreshed });
        assert(refreshed.scrollCalls.some(call => call.id === selected.id && call.block === "center"), "Reload did not request centering for the saved card highlight", refreshed);
        assert(refreshed.center !== null && (
            Math.abs(refreshed.center - refreshed.viewportCenter) <= 2
            || (refreshed.scrollY === 0 && refreshed.center < refreshed.viewportCenter)
        ), "Reload did not center the saved card as closely as document bounds allow", refreshed);
        return { selected, opened, restored, refreshed };
    });

    await navigate(playableUrl);
    await inject();
    await check(["V3", "V4", "V5", "V7", "A2", "A3"], "Player controls work and selected actor card is disabled", async () => {
        const state = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            for (let attempt = 0; attempt < 240
                && document.querySelectorAll(".ke-card").length < 2; attempt++) await wait(250);
            const video = document.querySelector(".ke-video");
            const progress = document.querySelector(".ke-progress-bar");
            video.currentTime = 0;
            await video.play();
            await wait(100);
            const play = document.querySelector('[aria-label="Pause"]');
            const before = {
                paused: video.paused,
                currentTime: video.currentTime,
                href: location.href,
            };
            play.click();
            await wait(250);
            const paused = video.paused;
            const resume = document.querySelector('[aria-label="Play"]');
            if (resume) resume.click();
            await wait(250);
            video.currentTime = 1;
            const touchEvent = (type, touches) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperty(event, "touches", { value: touches });
                video.dispatchEvent(event);
            };
            touchEvent("touchstart", [{ clientX: 100, clientY: 50 }]);
            touchEvent("touchmove", [{
                clientX: 100 + innerWidth / 4,
                clientY: 50,
            }]);
            const scrubbedTime = video.currentTime;
            touchEvent("touchend", []);
            await wait(250);
            const rect = progress.getBoundingClientRect();
            progress.dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true,
                clientX: rect.left + rect.width / 2,
            }));
            await wait(250);
            let copied = null;
            try {
                Object.defineProperty(navigator.clipboard, "writeText", {
                    configurable: true,
                    value: async value => { copied = value; },
                });
            } catch {}
            const selected = document.querySelector(".ke-card.selected");
            selected.click();
            await wait(250);
            return {
                before,
                paused,
                resumed: !video.paused,
                scrubbedTime,
                seekedTime: video.currentTime,
                duration: video.duration,
                selectedDisabled: selected.getAttribute("aria-disabled"),
                href: location.href,
                copied,
            };
        `);
        assert(state.paused && state.resumed, "Play control did not round-trip", state);
        assert(Math.abs(state.scrubbedTime - 16) < 1, "Video swipe did not scrub 15 seconds", state);
        assert(Math.abs(state.seekedTime - state.duration / 2) < 2, "Progress bar did not seek to its midpoint", state);
        assert(state.selectedDisabled === "true", "Current actor card is not disabled", state);
        assert(state.href === state.before.href && state.copied === null, "Current actor card copied or navigated", state);
        return state;
    });

    await check(["H1", "H2", "H3", "H4", "V6"], "Actor card replaces video history and known unsupported media keeps UI usable", async () => {
        const target = await command(`
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const expected = ${JSON.stringify(new URL(unsupportedUrl).pathname.replace(/\/$/, ""))};
            for (let attempt = 0; attempt < 360; attempt++) {
                const videos = await new Promise((resolve, reject) => {
                    const open = indexedDB.open("km-explorer");
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const request = open.result.transaction("videos", "readonly")
                            .objectStore("videos").getAll();
                        request.onerror = () => reject(request.error);
                        request.onsuccess = () => resolve(request.result);
                    };
                });
                const video = videos.find(item =>
                    new URL(item.pageUrl, location.origin).pathname.replace(/\\/$/, "") === expected
                );
                const card = video && document.querySelector(
                    '.ke-card[data-video-id="' + video.id + '"][data-video-src]'
                );
                if (card) return { id: video.id, src: card.dataset.videoSrc };
                await wait(250);
            }
            return null;
        `);
        assert(target, "Known unsupported Zoe card did not become ready");
        await command(`
            document.querySelector('.ke-card[data-video-id="${target.id}"]').click();
            return true;
        `, { expectResult: false });
        await session.waitForNavigation(client => client.href === unsupportedUrl, "known unsupported Zoe video");
        await inject();
        const state = await videoSnapshot({ waitForOutcome: true });
        assert(state.error?.code === 4, "Known unsupported video did not report Safari error 4", state);
        assert(state.actorCards > 1 && state.selectedCards === 1, "Unsupported video lost its actor UI", state);

        await command("history.back(); return true;", { expectResult: false });
        await session.waitForNavigation(client => new URL(client.href).pathname === "/page/2/", "one Back to listing");
        return { target, state };
    });

    await check(["I1", "I2", "I4"], "Real reload reconstructs the same provider video from IndexedDB and provider data", async () => {
        await navigate(playableUrl);
        await inject();
        const before = await videoSnapshot();
        await session.reload(playableUrl);
        await inject();
        const after = await videoSnapshot();
        assert(before.src === after.src, "Reload changed the selected media source", { before, after });
        assert(after.actorCards > 1 && after.selectedCards === 1, "Reload did not reconstruct actor UI", after);
        return { before, after };
    });

    await check(
        ["C1", "C2", "C3", "C4", "C5"],
        "Deterministic bfcache fixture restarts cache and terminally rejects other hosts",
        runCacheFixture,
    );

    await check(["R1", "R2", "R3", "R4", "R5"], "Shared routes consume the provider boundary", async () => {
        const files = [
            "src/main.ts",
            "src/routes/favs.ts",
            "src/routes/search.ts",
            "src/routes/video.ts",
            "src/routes/channel.ts",
            "src/ui/video-card.ts",
        ];
        const sources = await Promise.all(
            files.map(file => readFile(resolve(root, file), "utf8")),
        );
        const direct = sources.flatMap((source, index) =>
            source.includes("provider/ytb") ? [files[index]] : []
        );
        assert(direct.length === 0, "Shared modules import ytboob directly", direct);
        return { files };
    });
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
} finally {
    try {
        if (favoritesSnapshot || scrollSnapshot || cardHighlightSnapshot || fixtureCreated) {
            await navigate(homeUrl);
            if (favoritesSnapshot) await restoreFavorites(favoritesSnapshot);
            if (scrollSnapshot) await restoreScrollKey(scrollSnapshot);
            if (cardHighlightSnapshot) await restoreCardHighlight(cardHighlightSnapshot);
            if (fixtureCreated) await cleanupFixture();
        }
    } catch (error) {
        console.error("State restoration failed:", error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
    await session.cleanup();
    session.close();

    const passed = results.filter(result => result.status === "PASS").length;
    const failed = results.filter(result => result.status === "FAIL").length;
    const skipped = results.filter(result => result.status === "SKIP").length;
    console.log(`\nResult: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
    if (failed) process.exitCode = 1;
}
