/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-restricted-syntax */

// Helper function for retry delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function get(path, options = {}) {
  const retries = options.retry ?? 2;
  const backoff = options.backoff ?? 200;

  async function fetchWithRetry(attempt = 0) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;

      // Wait before retry (exponential backoff)
      const waitTime = backoff * (attempt + 1);
      await delay(waitTime);

      // Recursive call for next attempt
      return fetchWithRetry(attempt + 1);
    }
  }

  return fetchWithRetry();
}

export async function post(path, body = {}, options = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({ ok: res.ok }));
}
