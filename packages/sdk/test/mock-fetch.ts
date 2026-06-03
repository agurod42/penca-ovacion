export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  json?: unknown;
  text?: string;
  contentType?: string;
}

/** Build a fetch double that returns queued responses and records requests. */
export function mockFetch(queue: MockResponse[]): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const responses = [...queue];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init?.headers ?? {})) headers[k.toLowerCase()] = String(v);
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    const next = responses.shift() ?? { status: 200, json: {} };
    const status = next.status ?? 200;
    const contentType =
      next.contentType ?? (next.json !== undefined ? 'application/json' : 'text/plain');
    const bodyText = next.json !== undefined ? JSON.stringify(next.json) : (next.text ?? '');

    return new Response(bodyText, {
      status,
      headers: { 'content-type': contentType },
    });
  }) as typeof fetch;

  return { fetch: fetchImpl, requests };
}
