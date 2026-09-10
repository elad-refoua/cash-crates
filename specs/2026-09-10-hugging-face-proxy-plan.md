# Secure Hugging Face connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Cash Crates image edits through a Cloudflare Worker that holds a private Hugging Face token, while keeping the existing GitHub Pages editor and its safety behavior intact.

**Architecture:** A single Cloudflare Worker exposes a fixed, validated set of FLUX.1 Fill forwarding routes and adds the `HF_TOKEN` secret server-side. A focused browser client module calls that Worker; `lib/editor.ts` retains image masking and queue interpretation. The public site receives only the Worker URL, never the token.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vite, React, Node's built-in test runner, GitHub Pages.

**Spec:** `specs/2026-09-10-hugging-face-proxy-design.md`

## Global Constraints

- The Worker must forward only to `https://black-forest-labs-flux-1-fill-dev.hf.space`.
- `HF_TOKEN` must be configured as a Cloudflare encrypted secret and must never enter client code, Git, logs, responses, or tests.
- Permit browser origins only from `https://elad-refoua.github.io`; development origins are enabled only by a development variable.
- Preserve the existing 15 MB image input limit, local person protection, original-pixel restoration, queue messages, cancellation, and confirmed quota error messaging.
- Store no uploaded photo, prompt, output, visitor identifier, or account data.
- Keep the product free-only: do not add paid providers, credits, or anonymous fallback.
- Verify with the fictional sample image only; do not use patient, participant, or visitor data.

---

## File Structure

- `worker/src/index.ts`: route matching, CORS policy, request validation, safe forwarding, and secret access.
- `worker/wrangler.jsonc`: Worker name, compatibility date, public CORS configuration, and secret-name declaration.
- `worker/.dev.vars.example`: local development variable names only, without a token value.
- `tests/hugging-face-worker.test.mjs`: request-level tests with a mocked Hugging Face fetch implementation.
- `lib/hugging-face-client.ts`: browser-side functions for the Worker routes and safe generated-file retrieval.
- `lib/editor.ts`: replace direct Space fetches with the Worker client without changing masking/compositing logic.
- `tests/hugging-face-client.test.mjs`: tests that browser calls target the configured Worker and reject unexpected generated-image URLs.
- `vite.pages.config.ts`: make a non-sensitive Worker URL available to the production browser build.
- `README.md`: document deployment, secret configuration, daily account quota, and photo handling.

### Task 1: Create the bounded Cloudflare Worker

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.jsonc`
- Create: `worker/.dev.vars.example`
- Test: `tests/hugging-face-worker.test.mjs`

**Interfaces:**
- Consumes: `Env` with `HF_TOKEN: string`, `ALLOWED_ORIGIN: string`, and optional `ALLOW_LOCAL_ORIGIN: string`.
- Produces: a default Worker export with `fetch(request: Request, env: Env): Promise<Response>`.
- Produces: `createWorker(fetchImpl: typeof fetch): { fetch(request: Request, env: Env): Promise<Response> }` for deterministic tests.

- [ ] **Step 1: Write failing Worker-route tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker/src/index.ts';

const env = { HF_TOKEN: 'test-token', ALLOWED_ORIGIN: 'https://elad-refoua.github.io' };

test('forwards upload only to the fixed FLUX Space with server-side authorization', async () => {
  let target, authorization;
  const worker = createWorker(async (url, init) => {
    target = String(url); authorization = new Headers(init.headers).get('Authorization');
    return new Response(JSON.stringify(['/tmp/photo.png']), { headers: { 'content-type': 'application/json' } });
  });
  const request = new Request('https://worker.example/upload', {
    method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN }, body: new FormData(),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.equal(target, 'https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/upload');
  assert.equal(authorization, 'Bearer test-token');
  assert.doesNotMatch(await response.text(), /test-token/);
});

test('rejects a cross-origin request before contacting Hugging Face', async () => {
  let called = false;
  const worker = createWorker(async () => { called = true; return new Response(); });
  const response = await worker.fetch(new Request('https://worker.example/config', { headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test('rejects an untrusted generated-file URL', async () => {
  const worker = createWorker(async () => new Response());
  const response = await worker.fetch(new Request('https://worker.example/file?url=https%3A%2F%2Fattacker.example%2Fimage.png', { headers: { Origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(response.status, 400);
});
```

- [ ] **Step 2: Run the Worker test to verify it fails**

Run: `node --experimental-strip-types --test tests/hugging-face-worker.test.mjs`

Expected: FAIL because `worker/src/index.ts` does not exist.

- [ ] **Step 3: Implement exact route and origin validation**

```ts
const SPACE = 'https://black-forest-labs-flux-1-fill-dev.hf.space';
const allowedRoutes = new Map([
  ['GET /health', null], ['GET /config', '/config'],
  ['POST /upload', '/gradio_api/upload'], ['POST /queue/join', '/gradio_api/queue/join'],
  ['GET /queue/data', '/gradio_api/queue/data'],
]);

function trustedFileUrl(value: string) {
  const url = new URL(value);
  return url.origin === SPACE && url.pathname.startsWith('/gradio_api/file=');
}
```

Implement `createWorker` so it: answers `GET /health` without a token; rejects missing or non-allowed `Origin` with `403`; rejects unsupported method/path pairs with `404`; validates `/file?url=` with `trustedFileUrl`; requires `HF_TOKEN` for forwarding with a safe `503` message if absent; copies only the request body/content type needed by the route; forwards the queue-data query string; adds `Authorization: Bearer ${env.HF_TOKEN}`; and returns upstream status/body with CORS headers but never diagnostic headers or token values.

Create `worker/wrangler.jsonc` with a current compatibility date, `main: "src/index.ts"`, and non-secret `ALLOWED_ORIGIN: "https://elad-refoua.github.io"`. Create `worker/.dev.vars.example` containing only `HF_TOKEN=`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --experimental-strip-types --test tests/hugging-face-worker.test.mjs`

Expected: PASS for the fixed route, CORS rejection, and generated-file origin validation.

- [ ] **Step 5: Commit the Worker foundation**

```bash
git add worker/src/index.ts worker/wrangler.jsonc worker/.dev.vars.example tests/hugging-face-worker.test.mjs
git commit -m "Add secure Hugging Face Worker proxy"
```

### Task 2: Connect the existing browser editor to the Worker

**Files:**
- Create: `lib/hugging-face-client.ts`
- Modify: `lib/editor.ts:1-147`
- Modify: `vite.pages.config.ts`
- Test: `tests/hugging-face-client.test.mjs`

**Interfaces:**
- Consumes: `WORKER_URL` from the Vite build environment.
- Produces: `createHuggingFaceClient(baseUrl: string, fetchImpl?: typeof fetch)` with `config(signal)`, `upload(form, signal)`, `join(body, signal)`, `stream(sessionHash, signal)`, and `file(url, signal)` methods returning `Response`.
- Consumes: `createHuggingFaceClient` in `generateCash`.

- [ ] **Step 1: Write failing browser-client tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHuggingFaceClient } from '../lib/hugging-face-client.ts';

test('uses the configured Worker URL instead of direct Hugging Face calls', async () => {
  let requested;
  const client = createHuggingFaceClient('https://cash-crates-proxy.example', async (input) => {
    requested = String(input); return new Response('{}');
  });
  await client.config(new AbortController().signal);
  assert.equal(requested, 'https://cash-crates-proxy.example/config');
});

test('encodes the generated file URL only as a Worker query value', async () => {
  let requested;
  const client = createHuggingFaceClient('https://cash-crates-proxy.example/', async (input) => {
    requested = String(input); return new Response();
  });
  await client.file('https://black-forest-labs-flux-1-fill-dev.hf.space/gradio_api/file=/tmp/image.webp', new AbortController().signal);
  assert.match(requested, /^https:\/\/cash-crates-proxy\.example\/file\?url=/);
  assert.doesNotMatch(requested, /hf_/i);
});
```

- [ ] **Step 2: Run the browser-client test to verify it fails**

Run: `node --experimental-strip-types --test tests/hugging-face-client.test.mjs`

Expected: FAIL because `lib/hugging-face-client.ts` does not exist.

- [ ] **Step 3: Implement the client and replace direct Space fetches**

```ts
const configuredWorkerUrl = import.meta.env.VITE_HF_WORKER_URL?.replace(/\/$/, '');
if (!configuredWorkerUrl) throw new Error('The secure AI connection is not configured yet.');
const client = createHuggingFaceClient(configuredWorkerUrl);
const config = await (await checked(await client.config(signal))).json();
```

Move browser HTTP construction into `lib/hugging-face-client.ts`. Its `file` method must use `encodeURIComponent(url)`. Update `lib/editor.ts` to call the client for upload/config/join/stream/file while retaining the current queue payload, `checked`, `FluxServiceError`, event parser, prompt, mask, and final composite behavior. Define `VITE_HF_WORKER_URL` in `vite.pages.config.ts` only from the build environment, with no default token or direct authenticated fallback.

- [ ] **Step 4: Run focused tests and existing protocol tests**

Run: `node --experimental-strip-types --test tests/hugging-face-client.test.mjs tests/flux-protocol.test.mjs`

Expected: PASS for Worker targeting, encoded file forwarding, quota-message interpretation, and split queue frames.

- [ ] **Step 5: Commit the editor connection**

```bash
git add lib/hugging-face-client.ts lib/editor.ts vite.pages.config.ts tests/hugging-face-client.test.mjs
git commit -m "Route Cash Crates edits through secure worker"
```

### Task 3: Publish and verify without exposing the token

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `docs/` generated output via `npm run build:pages`

**Interfaces:**
- Consumes: the deployed Worker URL and `HF_TOKEN` entered only through Cloudflare's secret form.
- Produces: the GitHub Pages editor configured with `VITE_HF_WORKER_URL` and no token in generated assets.

- [ ] **Step 1: Write the deployment safety check**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the generated site does not contain a Hugging Face token prefix', async () => {
  const files = await readFile('docs/index.html', 'utf8');
  assert.doesNotMatch(files, /hf_[A-Za-z0-9]/);
});
```

Add this test to `tests/build-security.test.mjs`, then extend it to inspect every JavaScript asset listed under `docs/assets` after the production build.

- [ ] **Step 2: Run the build security test to verify it fails before the production build**

Run: `node --experimental-strip-types --test tests/build-security.test.mjs`

Expected: FAIL if the `docs/` output has not been rebuilt with the configured Worker URL.

- [ ] **Step 3: Add deployment instructions and ignore local secrets**

Add `worker/.dev.vars` to `.gitignore`. Update `README.md` with exact non-secret steps: create or sign in to Cloudflare; deploy from `worker/` with `npx wrangler deploy`; enter `HF_TOKEN` through `npx wrangler secret put HF_TOKEN` or the Cloudflare dashboard; set `VITE_HF_WORKER_URL` to the Worker URL when running `npm run build:pages`; push the rebuilt `docs/` directory. State that the token must not be pasted in chat or committed and that the free allowance is shared across visitors.

- [ ] **Step 4: Build and run all automated checks**

Run: `npm run build:pages`

Run: `node --experimental-strip-types --test tests/hugging-face-worker.test.mjs tests/hugging-face-client.test.mjs tests/flux-protocol.test.mjs tests/build-security.test.mjs`

Run: `npx tsc --noEmit`

Expected: all commands exit with code 0; no generated asset contains `hf_` followed by an alphanumeric character.

- [ ] **Step 5: Deploy and browser-test the authenticated connection**

Run: `npx wrangler deploy --config worker/wrangler.jsonc`

Run: `git add .gitignore README.md docs tests/build-security.test.mjs && git commit -m "Document secure AI deployment"`

Run: `git push origin main`

In a browser, load `https://elad-refoua.github.io/cash-crates/`, upload only `public/demo-before.png`, create an edit, and confirm the page reaches the Worker queue or reports the authenticated provider's real response. Inspect the page's public JavaScript assets to confirm the Hugging Face token is absent.

---

## Spec Coverage Review

- Fixed upstream target, CORS restrictions, encrypted token, and route validation: Task 1.
- Existing browser masking/compositing and safe image retrieval: Task 2.
- No stored files, no direct fallback, explicit provider errors, deployment, and user-facing verification: Tasks 1–3.
- Free-only quota behavior: preserved by Task 1 and documented in Task 3.

## Plan Self-Review

- Placeholder scan: no deferred implementation markers or unspecified tests remain.
- Interface consistency: `createWorker` and `createHuggingFaceClient` are introduced before their tests and used with matching signatures.
- Scope: one Worker and one editor integration form a single deployable feature; no unrelated service or data store is introduced.
