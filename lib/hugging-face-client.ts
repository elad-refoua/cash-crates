type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function configuredWorkerUrl() {
  const value = import.meta.env.VITE_HF_WORKER_URL;
  if (!value) throw new Error('The secure AI connection is not configured yet. Please try again after the site owner completes setup.');
  return value;
}

export function createHuggingFaceClient(baseUrl = configuredWorkerUrl(), fetchImpl: FetchImplementation = fetch) {
  const base = baseUrl.replace(/\/+$/, '');
  const request = (path: string, init: RequestInit) => fetchImpl(`${base}${path}`, init);

  return {
    config(signal: AbortSignal) {
      return request('/config', { signal });
    },
    upload(body: FormData, signal: AbortSignal) {
      return request('/upload', { method: 'POST', body, signal });
    },
    join(body: unknown, signal: AbortSignal) {
      return request('/queue/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    },
    stream(sessionHash: string, signal: AbortSignal) {
      return request(`/queue/data?session_hash=${encodeURIComponent(sessionHash)}`, { signal });
    },
    file(url: string, signal: AbortSignal) {
      return request(`/file?url=${encodeURIComponent(url)}`, { signal });
    },
  };
}
