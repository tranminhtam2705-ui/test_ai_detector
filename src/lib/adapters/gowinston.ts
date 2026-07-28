import type { Adapter, DetectorOutcome } from '../types';

const ENDPOINT = 'https://api.gowinston.ai/v2/ai-content-detection';
const MIN_CHARS = 300;

export const gowinstonAdapter: Adapter = {
  key: 'gowinston',
  displayName: 'Winston AI (GoWinston)',
  mode: 'api',
  configHint: 'Set GOWINSTON_API_KEY in .env.local',
  configured: () => Boolean(process.env.GOWINSTON_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const token = process.env.GOWINSTON_API_KEY;
    if (!token) return { status: 'error', error: 'GOWINSTON_API_KEY not configured' };
    if (text.length < MIN_CHARS) {
      return { status: 'error', error: `Text too short: Winston AI requires at least ${MIN_CHARS} characters (got ${text.length})` };
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, version: 'latest', sentences: false, language: 'auto' }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', error: `HTTP ${res.status}: ${JSON.stringify(body)}`, raw: body };
    }

    // Winston's "score" is a HUMAN score 0-100 (low = AI, high = human).
    const humanScore = typeof body?.score === 'number' ? body.score : null;
    const aiScore = humanScore === null ? null : Math.round((100 - humanScore)) / 100;
    return {
      status: 'ok',
      label: aiScore === null ? 'unknown' : aiScore >= 0.5 ? 'AI' : 'Human',
      aiScore,
      note: `human_score=${humanScore}`,
      raw: body,
    };
  },
};
