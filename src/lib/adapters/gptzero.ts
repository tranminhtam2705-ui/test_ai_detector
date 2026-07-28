import type { Adapter, DetectorOutcome } from '../types';
import { runBrowserChecker, extractPercentNear } from './browserCommon';

// GPTZero has no public REST API key flow available to us. This drives the
// free web checker on gptzero.me via a headless browser. No key required,
// but selectors are best-effort and may break if the site changes, and the
// site may rate-limit or block automated browsers outright.
export const gptzeroAdapter: Adapter = {
  key: 'gptzero',
  displayName: 'GPTZero',
  mode: 'browser',
  configHint: 'No API key available - uses best-effort browser automation against the free web checker',
  configured: () => true,

  async run(text: string): Promise<DetectorOutcome> {
    const result = await runBrowserChecker(text, {
      url: 'https://gptzero.me/',
      textSelectors: ['textarea', '[contenteditable="true"]'],
      submitSelectors: [
        'button:has-text("Check Origin")',
        'button:has-text("Check")',
        'button:has-text("Scan")',
        'button[type="submit"]',
      ],
      postSubmitWaitMs: 10000,
    });

    if (!result.ok) {
      return { status: 'error', error: `Browser automation failed: ${result.error}` };
    }

    const snippet = extractPercentNear(result.pageText ?? '', ['ai', 'human']);
    return {
      status: 'ok',
      label: 'unverified (browser automation)',
      aiScore: null,
      note: snippet ?? 'Could not confidently locate a result percentage on the page; see raw page text.',
      raw: { pageTextSnippet: (result.pageText ?? '').slice(0, 4000) },
    };
  },
};
