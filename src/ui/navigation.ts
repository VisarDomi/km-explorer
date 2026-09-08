/** Follow a native link and leave history/bfcache to Safari. */
export function navigate(url: string): void {
    // At document_start, window.stop() can leave Safari's document "loading".
    // A later location.href without user activation then REPLACES history.
    // Follow a native link instead: preserve the prior document for Safari Back
    // and bfcache, without pushState entries or a client-side history router.
    const link = document.createElement('a');
    link.href = url;
    link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); }
    finally { link.remove(); }
}
