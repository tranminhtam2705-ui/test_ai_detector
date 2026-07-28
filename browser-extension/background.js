// Tracks in-flight XHR/fetch requests to the 3 detector sites and records
// how long each one took (ms) once it completes or errors. There is no
// public API for these tools, so this measures latency the same way
// Chrome DevTools' Network panel would - just filtered to the relevant
// domains and kept in a small persistent side panel instead of a one-off tab.

const WATCHED_URLS = ['*://*.gptzero.me/*', '*://*.originality.ai/*', '*://*.grammarly.com/*'];
const MAX_RECORDS = 300;

// requestId -> { startTs, url, method }
const inFlight = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    inFlight.set(details.requestId, {
      startTs: details.timeStamp,
      url: details.url,
      method: details.method,
    });
  },
  { urls: WATCHED_URLS, types: ['xmlhttprequest'] },
);

function finish(details, status, error) {
  const entry = inFlight.get(details.requestId);
  if (!entry) return;
  inFlight.delete(details.requestId);

  let hostname = entry.url;
  try {
    hostname = new URL(entry.url).hostname;
  } catch {
    // keep raw url as fallback
  }

  const record = {
    id: details.requestId + '-' + details.timeStamp,
    url: entry.url,
    method: entry.method,
    domain: hostname,
    status: status ?? null,
    error: error ?? null,
    durationMs: Math.round(details.timeStamp - entry.startTs),
    finishedAt: details.timeStamp,
  };

  chrome.storage.session.get({ records: [] }, ({ records }) => {
    const next = [record, ...records].slice(0, MAX_RECORDS);
    chrome.storage.session.set({ records: next });
  });
}

chrome.webRequest.onCompleted.addListener(
  (details) => finish(details, details.statusCode, null),
  { urls: WATCHED_URLS, types: ['xmlhttprequest'] },
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => finish(details, null, details.error),
  { urls: WATCHED_URLS, types: ['xmlhttprequest'] },
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
