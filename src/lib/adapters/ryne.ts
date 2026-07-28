import type { Adapter, DetectorOutcome } from '../types';
import { fetchWithRetry } from '../http';

const ENDPOINT = 'https://ryne.ai/api/ai-score';

// Note: Ryne.ai's main product is an AI-humanizer/detector-bypass tool, but
// it separately exposes a real "AI Score Checker API" used as a detector
// here, per user's explicit request to track it alongside the other tools.
export const ryneAdapter: Adapter = {
  key: 'ryne',
  displayName: 'Ryne.ai (AI Score Checker)',
  mode: 'api',
  configHint: 'Set RYNE_API_KEY in .env.local',
  configured: () => Boolean(process.env.RYNE_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const apiKey = process.env.RYNE_API_KEY;
    if (!apiKey) return { status: 'error', error: 'RYNE_API_KEY not configured' };

    const res = await fetchWithRetry(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, user_id: apiKey }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', error: `HTTP ${res.status}: ${JSON.stringify(body)}`, raw: body };
    }

    const aiScorePct = typeof body?.aiScore === 'number' ? body.aiScore : null;
    return {
      status: 'ok',
      label: body?.classification ?? 'unknown',
      aiScore: aiScorePct === null ? null : aiScorePct / 100,
      note: `confidence=${body?.details?.confidence}, risk=${body?.details?.analysis?.risk}`,
      raw: body,
    };
  },
};
