# AI Detector Testing Portal

A small internal portal for benchmarking AI-content-detector quality across
multiple third-party tools using a shared dataset.

For each row in an uploaded dataset, the portal calls every enabled detector
and records the result in the format `dataset|tool_used|result`.

## Tools

| Tool | Integration | Notes |
| --- | --- | --- |
| Sapling | Real REST API | `POST https://api.sapling.ai/api/v1/aidetect` |
| Winston AI (gowinston.ai) | Real REST API | Requires text >= 300 characters |
| Pangram | Real REST API (async task) | Submits + polls until the task completes |
| Copyleaks | Real REST API (login + check) | Requires account email + API key; text >= 255 characters |
| WalterWrites | Real REST API (sync or async job) | Requires text >= 50 words |
| Ryne.ai (AI Score Checker) | Real REST API | Separate from Ryne's humanizer product |
| GPTZero | Best-effort browser automation (Playwright) | No public API available to us; site may block headless browsers |
| Originality.ai | Best-effort browser automation | Normally requires a logged-in, paid account; likely to fail |
| Grammarly | Best-effort browser automation | Grammarly's AI detector normally requires a logged-in editor session; likely to fail |

The three browser-automation tools have no public API. They drive the site's
free web UI with a headless browser as a best effort. Several of these sites
run bot-detection (e.g. Cloudflare) that resets automated browser connections
outright — when that happens the result is surfaced as an explicit error
rather than fabricated data.

## Setup

1. Copy `.env.local.example` to `.env.local` (or edit `.env.local` directly)
   and fill in API keys:

   ```
   SAPLING_API_KEY=
   GOWINSTON_API_KEY=
   PANGRAM_API_KEY=
   PANGRAM_API_NAME=
   COPYLEAKS_EMAIL=
   COPYLEAKS_API_KEY=
   RYNE_API_KEY=
   WALTERWRITES_API_KEY=
   ```

   Any tool whose key is missing shows as "not configured" in the UI and is
   skipped with a clear error per row rather than failing the whole run.

2. Install dependencies and run:

   ```
   npm install
   npm run dev
   ```

   Node's built-in `fetch` does not read the `HTTPS_PROXY` environment
   variable by default. If you're running behind an outbound proxy (as in
   this sandbox), start the dev server with:

   ```
   NODE_USE_ENV_PROXY=1 npm run dev
   ```

3. Open http://localhost:3000, select the tools to test, upload a CSV or
   JSON dataset (a `text` column/field is required; `id` and `label` are
   optional), and click "Bắt đầu chạy".

## Dataset format

CSV:

```csv
id,text,label
1,"Some text to test...",human
2,"Some other text...",ai
```

JSON: either a bare array of `{ id, text, label }` objects, or
`{ "rows": [...] }`.

Max 200 rows per run.

## Output format

Results are shown in a table and can be exported as plain text in the
requested pipe-delimited format:

```
dataset|tool_used|result
<text>|<tool key>|<label> (aiScore=<0-1>)
```

Errors (missing config, API errors, insufficient credits, text too short,
browser automation failures, etc.) appear as `ERROR: <message>` in the
`result` column instead of being silently dropped.

## Known limitations

- GPTZero, Originality.ai, and Grammarly have no public API we could find;
  automation against their free web checkers is inherently fragile and may
  break if they change their UI, add a login wall, or strengthen bot
  detection.
- Pangram and Ryne.ai require account credit/coin balance; requests fail
  with `Insufficient credits` / `Insufficient API coins` if the account is
  empty. Top up the respective dashboards to get real results.
- Winston AI requires >= 300 characters and WalterWrites requires >= 50
  words per request; shorter dataset rows are reported as an explicit error
  for that tool rather than silently skipped.
- Ryne.ai's flagship product is actually an AI-humanizer / detector-bypass
  tool. It separately exposes a real "AI Score Checker" API, which is what
  this portal calls - keep in mind its role differs from the other tools
  when interpreting results.
