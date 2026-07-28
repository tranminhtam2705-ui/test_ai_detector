/**
 * fetch() wrapper that automatically retries on HTTP 429 (rate limited).
 * Reads a Retry-After header or an "available in N second(s)" message from
 * the body when present; otherwise backs off with a fixed delay per attempt.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { maxRetries?: number; fallbackDelayMs?: number },
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  const fallbackDelayMs = opts?.fallbackDelayMs ?? 4000;

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxRetries) return res;

    let delayMs = fallbackDelayMs * (attempt + 1);
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter && !isNaN(Number(retryAfter))) {
      delayMs = Number(retryAfter) * 1000;
    } else {
      const bodyText = await res.clone().text().catch(() => '');
      const match = bodyText.match(/available in\s+(\d+(?:\.\d+)?)\s*second/i);
      if (match) delayMs = Math.ceil(Number(match[1]) * 1000) + 500;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
