import type { Browser } from 'playwright-core';

const CHROMIUM_PATH = process.env.CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const { chromium } = await import('playwright-core');
    browserPromise = chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  return browserPromise;
}

export type BrowserCheckerOptions = {
  url: string;
  textSelectors: string[];
  submitSelectors: string[];
  navTimeoutMs?: number;
  postSubmitWaitMs?: number;
  maxChars?: number;
};

export type BrowserCheckerResult = {
  ok: boolean;
  error?: string;
  pageText?: string;
};

/**
 * Best-effort UI automation against a site's free web checker. There is no
 * public API for these tools, so this fills the first textarea-like element
 * it finds, clicks a plausible "check/scan" button, and returns the visible
 * page text afterwards for manual/heuristic interpretation. Sites with bot
 * protection (Cloudflare, etc.) may block this entirely - failures are
 * surfaced as errors rather than fabricated results.
 */
export async function runBrowserChecker(text: string, opts: BrowserCheckerOptions): Promise<BrowserCheckerResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: opts.navTimeoutMs ?? 30000 });

    let filled = false;
    for (const sel of opts.textSelectors) {
      const el = page.locator(sel).first();
      if (await el.count().catch(() => 0)) {
        await el.click({ timeout: 5000 }).catch(() => {});
        await el.fill(text.slice(0, opts.maxChars ?? 5000), { timeout: 5000 }).catch(async () => {
          await el.type(text.slice(0, opts.maxChars ?? 5000), { timeout: 5000 }).catch(() => {});
        });
        filled = true;
        break;
      }
    }
    if (!filled) {
      return { ok: false, error: 'Could not find a text input field on the page (selectors may be outdated).' };
    }

    let clicked = false;
    for (const sel of opts.submitSelectors) {
      const el = page.locator(sel).first();
      if (await el.count().catch(() => 0)) {
        await el.click({ timeout: 5000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      return { ok: false, error: 'Could not find a submit/check button on the page (selectors may be outdated).' };
    }

    await page.waitForTimeout(opts.postSubmitWaitMs ?? 8000);
    const pageText = await page.innerText('body').catch(() => '');
    return { ok: true, pageText };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

export function extractPercentNear(pageText: string, keywords: string[]): string | null {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\d{1,3}\s?%/.test(line)) {
      const windowText = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
      if (keywords.some((k) => windowText.toLowerCase().includes(k.toLowerCase()))) {
        return windowText;
      }
    }
  }
  return null;
}
