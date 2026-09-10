export type Env = {
  HF_TOKEN?: string;
  ALLOWED_ORIGIN: string;
  ALLOW_LOCAL_ORIGIN?: string;
};

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const SPACE = 'https://black-forest-labs-flux-1-fill-dev.hf.space';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin) return request.method === 'GET' && new URL(request.url).pathname === '/health' ? undefined : null;
  if (origin === env.ALLOWED_ORIGIN || (env.ALLOW_LOCAL_ORIGIN && origin === env.ALLOW_LOCAL_ORIGIN)) return origin;
  return null;
}

function response(body: BodyInit | null, init: ResponseInit, origin?: string) {
  const headers = new Headers(init.headers);
  if (origin) for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

function error(message: string, status: number, origin?: string) {
  return response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }, origin);
}

function hasAllowedUploadSize(request: Request) {
  const declared = Number(request.headers.get('Content-Length'));
  return !Number.isFinite(declared) || declared <= MAX_UPLOAD_BYTES;
}

function trustedFileUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === SPACE && url.pathname.startsWith('/gradio_api/file=');
  } catch {
    return false;
  }
}

function safeUpstreamHeaders(upstream: Headers, origin?: string) {
  const headers = new Headers();
  for (const name of ['Content-Type', 'Content-Length', 'Cache-Control', 'Content-Disposition']) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  if (origin) for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return headers;
}

function targetFor(request: Request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/config') return new URL('/config', SPACE);
  if (request.method === 'POST' && url.pathname === '/upload') return new URL('/gradio_api/upload', SPACE);
  if (request.method === 'POST' && url.pathname === '/queue/join') return new URL('/gradio_api/queue/join', SPACE);
  if (request.method === 'GET' && url.pathname === '/queue/data') {
    const sessionHash = url.searchParams.get('session_hash');
    if (!sessionHash || !/^[a-zA-Z0-9_-]{8,128}$/.test(sessionHash)) return undefined;
    const target = new URL('/gradio_api/queue/data', SPACE);
    target.searchParams.set('session_hash', sessionHash);
    return target;
  }
  if (request.method === 'GET' && url.pathname === '/file') {
    const fileUrl = url.searchParams.get('url');
    return fileUrl && trustedFileUrl(fileUrl) ? new URL(fileUrl) : undefined;
  }
  return null;
}

export function createWorker(fetchImpl: FetchImplementation = fetch) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const origin = allowedOrigin(request, env);
      if (origin === null) return error('This connection only accepts requests from Cash Crates.', 403);

      if (request.method === 'OPTIONS') return response(null, { status: 204 }, origin);
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') return response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }, origin);

      const target = targetFor(request);
      if (target === null) return error('Unknown secure AI connection route.', 404, origin);
      if (!target) return error('Invalid secure AI connection request.', 400, origin);
      if (!env.HF_TOKEN) return error('The secure AI connection is not configured yet.', 503, origin);
      if (!hasAllowedUploadSize(request)) return error('This photo is larger than the 15 MB limit.', 413, origin);

      const contentType = request.headers.get('Content-Type') ?? '';
      if (url.pathname === '/upload' && !contentType.startsWith('multipart/form-data')) return error('Upload data must be multipart form data.', 415, origin);
      if (url.pathname === '/queue/join' && !contentType.startsWith('application/json')) return error('Queue data must be JSON.', 415, origin);

      const headers = new Headers({ Authorization: `Bearer ${env.HF_TOKEN}` });
      if (contentType) headers.set('Content-Type', contentType);
      const upstream = await fetchImpl(target, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? request.body : undefined,
      });
      return new Response(upstream.body, { status: upstream.status, headers: safeUpstreamHeaders(upstream.headers, origin) });
    },
  };
}

export default createWorker();
