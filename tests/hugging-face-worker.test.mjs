import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/src/index.ts';

const env = {
  HF_TOKEN: 'test-token',
  ALLOWED_ORIGIN: 'https://elad-refoua.github.io',
};

function pageHeaders() {
  return { Origin: env.ALLOWED_ORIGIN };
}

test('forwards uploads only to the fixed FLUX Space with server-side authorization', async () => {
  let target = '';
  let authorization = '';
  const worker = createWorker(async (url, init = {}) => {
    target = String(url);
    authorization = new Headers(init.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify(['/tmp/photo.png']), {
      headers: { 'content-type': 'application/json' },
    });
  });

  const response = await worker.fetch(new Request('https://worker.example/upload', {
    method: 'POST',
    headers: pageHeaders(),
    body: new FormData(),
  }), env);

  assert.equal(response.status, 200);
  assert.equal(target, 'https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/upload');
  assert.equal(authorization, 'Bearer test-token');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  assert.doesNotMatch(await response.text(), /test-token/);
});

test('relays only the expected queue stream and its session hash', async () => {
  let target = '';
  const worker = createWorker(async (url) => {
    target = String(url);
    return new Response('data: {"msg":"estimation"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
  });

  const response = await worker.fetch(new Request('https://worker.example/queue/data?session_hash=session123', {
    headers: pageHeaders(),
  }), env);

  assert.equal(response.status, 200);
  assert.equal(target, 'https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/queue/data?session_hash=session123');
  assert.equal(await response.text(), 'data: {"msg":"estimation"}\n\n');
});

test('rejects cross-origin requests before contacting Hugging Face', async () => {
  let called = false;
  const worker = createWorker(async () => {
    called = true;
    return new Response();
  });

  const response = await worker.fetch(new Request('https://worker.example/config', {
    headers: { Origin: 'https://attacker.example' },
  }), env);

  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test('rejects unsupported routes and untrusted generated-file URLs', async () => {
  const worker = createWorker(async () => new Response());
  const invalidRoute = await worker.fetch(new Request('https://worker.example/not-a-route', { headers: pageHeaders() }), env);
  const invalidFile = await worker.fetch(new Request('https://worker.example/file?url=https%3A%2F%2Fattacker.example%2Fimage.png', { headers: pageHeaders() }), env);

  assert.equal(invalidRoute.status, 404);
  assert.equal(invalidFile.status, 400);
});

test('does not invoke Hugging Face when the secret is absent', async () => {
  let called = false;
  const worker = createWorker(async () => {
    called = true;
    return new Response();
  });
  const response = await worker.fetch(new Request('https://worker.example/config', { headers: pageHeaders() }), {
    ALLOWED_ORIGIN: env.ALLOWED_ORIGIN,
  });

  assert.equal(response.status, 503);
  assert.equal(called, false);
  assert.match(await response.text(), /not configured/i);
});
