/**
 * Minimal fetch wrapper used by all query/mutation hooks.
 *
 * - JSON in / JSON out by default.
 * - On !res.ok, throws an Error whose message comes from the JSON `{ error }`
 *   field the backend sends, falling back to `res.statusText`.
 */
export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);

  if (!res.ok) {
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse failures — keep statusText
    }
    throw new Error(message);
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
