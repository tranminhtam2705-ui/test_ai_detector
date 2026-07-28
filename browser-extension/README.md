# AI Detector Latency Sidebar (Chrome extension)

For GPTZero, Originality.ai, and Grammarly - the 3 tools in this project with
no usable public API - this extension measures request latency (ms) while
you manually test them on their own websites, shown in a persistent side
panel instead of digging through Chrome DevTools every time.

It works like DevTools' Network panel: it watches XHR/fetch requests to
`gptzero.me`, `originality.ai`, and `grammarly.com`, and for each one records
how long it took from request start to response (or error), in milliseconds.
Nothing is sent anywhere - all data stays in the browser's local session
storage for this browsing session.

## Install (load unpacked, no Chrome Web Store needed)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this `browser-extension/` folder.
4. Click the extension's icon in the toolbar once to open the side panel
   (it opens on the right side of the window and stays open while you
   browse).

## Usage

1. With the side panel open, navigate to gptzero.me, originality.ai, or
   grammarly.com in the same window.
2. Paste your text into their checker and click Check/Scan/Detect as usual.
3. Every XHR/fetch request to that domain shows up in the panel with its
   duration in ms, HTTP status, method, and path.

Notes:

- These sites also fire unrelated background requests (analytics, etc.),
  which will show up too - use the filter box at the top (matches against
  the request URL, e.g. type `detect` or `check`) to narrow down to the
  actual detection call. There's no reliable way to auto-detect which
  request is "the" detection call without knowing each site's internal API,
  which isn't publicly documented.
- Duration is measured the same way Chrome's Network panel measures it
  (from `onBeforeRequest` to `onCompleted`/`onErrorOccurred`), i.e. total
  round-trip time as seen by the browser - not the server's own internal
  processing time.
- The log is kept in `chrome.storage.session`, so it clears when the
  browser session ends; click **Xoá log** to clear it manually at any time.
- If a site is behind a login wall or blocks the request outright, that
  will show up as an HTTP error status or a `net::ERR_*` error in the
  panel - itself useful information about why manual testing failed.

## Alternative: no install at all

If you don't want to install even an unpacked extension, Chrome DevTools
does the same thing natively: open DevTools (F12) → **Network** tab →
filter by domain → look at the **Time** column after triggering a check.
This extension just keeps that view open persistently and scoped to the 3
domains, across page navigations, without you having to reopen DevTools
and re-filter each time.
