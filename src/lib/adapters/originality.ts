import type { Adapter, DetectorOutcome } from '../types';
import { runBrowserChecker, extractPercentNear } from './browserCommon';

// Originality.ai's checker normally requires a logged-in account with
// credits. No API key was provided, so this is a best-effort attempt against
// the public marketing page; it will likely fail behind a login wall.
export const originalityAdapter: Adapter = {
  key: 'originality',
  displayName: 'Originality.ai',
  mode: 'browser',
  configHint: 'No API key available - best-effort browser automation; likely requires login and may fail',
  configured: () => true,

  async run(text: string): Promise<DetectorOutcome> {
    const result = await runBrowserChecker(text, {
      url: 'https://originality.ai/ai-content-detector',
      textSelectors: ['textarea', '[contenteditable="true"]'],
      submitSelectors: [
        'button:has-text("Scan")',
        'button:has-text("Check")',
        'button:has-text("Detect")',
        'button[type="submit"]',
      ],
      postSubmitWaitMs: 10000,
    });

    if (!result.ok) {
      return { status: 'error', error: `Browser automation failed (likely login required): ${result.error}` };
    }

    const snippet = extractPercentNear(result.pageText ?? '', ['ai', 'original', 'human']);
    return {
      status: 'ok',
      label: 'unverified (browser automation)',
      aiScore: null,
      note: snippet ?? 'Could not confidently locate a result percentage on the page; see raw page text.',
      raw: { pageTextSnippet: (result.pageText ?? '').slice(0, 4000) },
    };
  },
};
