import type { Adapter, DetectorOutcome } from '../types';
import { runBrowserChecker, extractPercentNear } from './browserCommon';

// Grammarly does not expose a public AI-detection API. Its AI detector is
// normally only usable inside the logged-in editor, not as a standalone
// anonymous web checker. This attempt against the public marketing page will
// very likely fail - kept here for completeness/transparency rather than
// silently omitting the tool.
export const grammarlyAdapter: Adapter = {
  key: 'grammarly',
  displayName: 'Grammarly',
  mode: 'browser',
  configHint: 'No public API; Grammarly AI detector normally requires a logged-in editor session',
  configured: () => true,

  async run(text: string): Promise<DetectorOutcome> {
    const result = await runBrowserChecker(text, {
      url: 'https://www.grammarly.com/ai-detector',
      textSelectors: ['textarea', '[contenteditable="true"]'],
      submitSelectors: [
        'button:has-text("Check")',
        'button:has-text("Detect")',
        'button[type="submit"]',
      ],
      postSubmitWaitMs: 10000,
    });

    if (!result.ok) {
      return { status: 'error', error: `Browser automation failed (likely requires a logged-in Grammarly editor session): ${result.error}` };
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
