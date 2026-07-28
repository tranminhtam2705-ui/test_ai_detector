import type { Adapter, DetectorOutcome } from '../types';

const LOGIN_ENDPOINT = 'https://id.copyleaks.com/v3/account/login/api';
const MIN_CHARS = 255;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(email: string, key: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, key }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    throw new Error(`Copyleaks login failed: HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  // Token is valid 48h; cache for 47h to be safe.
  cachedToken = { token: body.access_token, expiresAt: Date.now() + 47 * 60 * 60 * 1000 };
  return cachedToken.token;
}

export const copyleaksAdapter: Adapter = {
  key: 'copyleaks',
  displayName: 'Copyleaks',
  mode: 'api',
  configHint: 'Set COPYLEAKS_EMAIL and COPYLEAKS_API_KEY in .env.local',
  configured: () => Boolean(process.env.COPYLEAKS_EMAIL && process.env.COPYLEAKS_API_KEY),

  async run(text: string): Promise<DetectorOutcome> {
    const email = process.env.COPYLEAKS_EMAIL;
    const key = process.env.COPYLEAKS_API_KEY;
    if (!email || !key) {
      return { status: 'error', error: 'COPYLEAKS_EMAIL / COPYLEAKS_API_KEY not configured' };
    }
    if (text.length < MIN_CHARS) {
      return { status: 'error', error: `Text too short: Copyleaks requires at least ${MIN_CHARS} characters (got ${text.length})` };
    }

    let token: string;
    try {
      token = await getAccessToken(email, key);
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }

    const scanId = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch(`https://api.copyleaks.com/v2/writer-detector/${scanId}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, sandbox: false, explain: false, sensitivity: 2 }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { status: 'error', error: `HTTP ${res.status}: ${JSON.stringify(body)}`, raw: body };
    }

    const aiScore = typeof body?.summary?.ai === 'number' ? body.summary.ai : null;
    return {
      status: 'ok',
      label: aiScore === null ? 'unknown' : aiScore >= 0.5 ? 'AI' : 'Human',
      aiScore,
      note: `human=${body?.summary?.human}`,
      raw: body,
    };
  },
};
