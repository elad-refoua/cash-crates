import test from 'node:test';
import assert from 'node:assert/strict';
import { createHuggingFaceClient } from '../lib/hugging-face-client.ts';

test('uses the configured Worker URL instead of direct Hugging Face calls', async () => {
  let requested = '';
  const client = createHuggingFaceClient('https://cash-crates-proxy.example', async (input) => {
    requested = String(input);
    return new Response('{}');
  });

  await client.config(new AbortController().signal);

  assert.equal(requested, 'https://cash-crates-proxy.example/config');
});

test('encodes generated image URLs only as a Worker query value', async () => {
  let requested = '';
  const client = createHuggingFaceClient('https://cash-crates-proxy.example/', async (input) => {
    requested = String(input);
    return new Response();
  });
  const source = 'https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/file=/tmp/image.webp';

  await client.file(source, new AbortController().signal);

  assert.match(requested, /^https:\/\/cash-crates-proxy\.example\/file\?url=/);
  assert.equal(new URL(requested).searchParams.get('url'), source);
  assert.doesNotMatch(requested, /hf_/i);
});

test('sends queue data and queue streams through the Worker', async () => {
  const requests = [];
  const client = createHuggingFaceClient('https://cash-crates-proxy.example', async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response();
  });

  await client.join({ data: ['value'] }, new AbortController().signal);
  await client.stream('safe_session-123', new AbortController().signal);

  assert.equal(requests[0].url, 'https://cash-crates-proxy.example/queue/join');
  assert.equal(new Headers(requests[0].init.headers).get('Content-Type'), 'application/json');
  assert.equal(requests[1].url, 'https://cash-crates-proxy.example/queue/data?session_hash=safe_session-123');
});
