import type { Adapter, DetectorOutcome } from '../types';
import { fetchWithRetry } from '../http';

const DETECT_ENDPOINT = 'https://developer-portal.walterwrites.ai/api/detector/';
const JOB_ENDPOINT = (taskId: string) => `https://developer-portal.walterwrites.ai/api/jobs/${taskId}/`;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOutcome(body: any): DetectorOutcome {
  const aiScore = typeof body?.ai_score === 'number' ? body.ai_score : null;
  return {
    status: 'ok',
    label: body?.result ?? (aiScore === null ? 'unknown' : aiScore >= 0.5 ? 'ai' : 'human'),
    aiScore,
    note: `credits_remaining=${body?.credits_remaining}`,
    raw: body,
  };
}

export const walterwritesAdapter: Adapter = {
  key: 'walterwrites',
  displayName: 'WalterWrites',
  mode: 'api',
  configHint: 'Set WALTERWRITES_API_KEY in .env.local',
  configured: () => Boolean(process.env.WALTERWRITES_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const apiKey = process.env.WALTERWRITES_API_KEY;
    if (!apiKey) return { status: 'error', error: 'WALTERWRITES_API_KEY not configured' };

    const res = await fetchWithRetry(DETECT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ content: text }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok && res.status !== 202) {
      return { status: 'error', error: `HTTP ${res.status}: ${JSON.stringify(body)}`, raw: body };
    }

    if (res.status === 200 && body?.status === 'success') {
      return toOutcome(body);
    }

    const taskId = body?.task_id;
    if (!taskId) {
      return { status: 'error', error: 'WalterWrites did not return a task_id for async job', raw: body };
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const pollRes = await fetchWithRetry(JOB_ENDPOINT(taskId), { headers: { 'X-API-Key': apiKey } });
      const pollBody = await pollRes.json().catch(() => null);
      if (!pollRes.ok) {
        return { status: 'error', error: `HTTP ${pollRes.status} on poll: ${JSON.stringify(pollBody)}`, raw: pollBody };
      }
      if (pollBody?.status === 'success') return toOutcome(pollBody);
      if (pollBody?.status === 'failed' || pollBody?.status === 'error') {
        return { status: 'error', error: 'WalterWrites job failed', raw: pollBody };
      }
    }
    return { status: 'error', error: `WalterWrites job ${taskId} did not complete within ${POLL_TIMEOUT_MS}ms` };
  },
};
