import type { Adapter, DetectorOutcome } from '../types';
import { fetchWithRetry } from '../http';

const BASE = 'https://text.external-api.pangram.com';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const pangramAdapter: Adapter = {
  key: 'pangram',
  displayName: 'Pangram',
  mode: 'api',
  configHint: 'Set PANGRAM_API_KEY in .env.local',
  configured: () => Boolean(process.env.PANGRAM_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const apiKey = process.env.PANGRAM_API_KEY;
    if (!apiKey) return { status: 'error', error: 'PANGRAM_API_KEY not configured' };

    const submitRes = await fetchWithRetry(`${BASE}/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ text, public_dashboard_link: false }),
    });
    const submitBody = await submitRes.json().catch(() => null);
    if (!submitRes.ok) {
      return { status: 'error', error: `HTTP ${submitRes.status} on submit: ${JSON.stringify(submitBody)}`, raw: submitBody };
    }
    const taskId = submitBody?.task_id;
    if (!taskId) {
      return { status: 'error', error: 'Pangram did not return a task_id', raw: submitBody };
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const pollRes = await fetchWithRetry(`${BASE}/task/${taskId}`, {
        headers: { 'x-api-key': apiKey },
      });
      const pollBody = await pollRes.json().catch(() => null);
      if (!pollRes.ok) {
        return { status: 'error', error: `HTTP ${pollRes.status} on poll: ${JSON.stringify(pollBody)}`, raw: pollBody };
      }
      if (pollBody?.stage === 'STAGE_SUCCESS') {
        const aiScore = typeof pollBody?.fraction_ai === 'number' ? pollBody.fraction_ai : null;
        return {
          status: 'ok',
          label: pollBody?.prediction_short ?? pollBody?.headline ?? 'unknown',
          aiScore,
          note: `fraction_ai_assisted=${pollBody?.fraction_ai_assisted}, fraction_human=${pollBody?.fraction_human}`,
          raw: pollBody,
        };
      }
      if (pollBody?.stage === 'STAGE_FAILED') {
        return { status: 'error', error: 'Pangram task failed', raw: pollBody };
      }
    }
    return { status: 'error', error: `Pangram task ${taskId} did not complete within ${POLL_TIMEOUT_MS}ms` };
  },
};
