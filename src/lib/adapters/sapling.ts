import type { Adapter, DetectorOutcome } from '../types';
import { fetchWithRetry } from '../http';

const ENDPOINT = 'https://api.sapling.ai/api/v1/aidetect';

export const saplingAdapter: Adapter = {
  key: 'sapling',
  displayName: 'Sapling',
  mode: 'api',
  configHint: 'Set SAPLING_API_KEY in .env.local',
  configured: () => Boolean(process.env.SAPLING_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const key = process.env.SAPLING_API_KEY;
    if (!key) return { status: 'error', error: 'SAPLING_API_KEY not configured' };

    const res = await fetchWithRetry(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, text, sent_scores: false, score_string: false }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', error: `HTTP ${res.status}: ${JSON.stringify(body)}`, raw: body };
    }

    const score = typeof body?.score === 'number' ? body.score : null;
    return {
      status: 'ok',
      label: score === null ? 'unknown' : score >= 0.5 ? 'AI' : 'Human',
      aiScore: score,
      raw: body,
    };
  },
};
