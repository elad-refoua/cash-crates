# Cash Crates

A public, free photo editor: upload a JPG, PNG, or WebP, position an edit area beside a person, and generate wooden crates of cash using FLUX.1 Fill. The public site has no account or token field, and it does not store application photos.

## Development and GitHub Pages

```sh
npm ci
npm run dev:pages
npm run build:pages
```

GitHub Pages serves the committed `docs/` directory on `main`. After editing source, run `npm run build:pages` and commit both source and `docs/`. Relative URLs support the repository subdirectory. The original Vinext starter remains available but is not the GitHub Pages entrypoint.

### Secure Hugging Face connection

The browser routes generation through the Cloudflare Worker in `worker/`. The Worker adds the `HF_TOKEN` secret only while it forwards requests to FLUX.1 Fill. Never put that token in GitHub, a Vite environment file committed to the repository, this chat, an issue, or a screenshot.

1. Sign in to Cloudflare and run `npx wrangler deploy --config worker/wrangler.jsonc` from the project root.
2. Save the token directly in Cloudflare with `npx wrangler secret put HF_TOKEN --config worker/wrangler.jsonc`, or use the Worker's **Settings → Variables and Secrets** page. The token is entered only in Cloudflare's protected secret form.
3. Copy the deployed Worker URL and build the static site with `VITE_HF_WORKER_URL=https://your-worker.workers.dev npm run build:pages`.
4. Run the tests below, commit source plus `docs/`, and push `main`.

The Hugging Face free-account allowance is shared by every visitor to this site. The Worker does not retain photos, prompts, generated images, or account data. Cloudflare and the public FLUX Space process each request in transit. There is no paid-provider or anonymous fallback.

## Image processing

- MediaPipe Selfie Segmenter runs locally and protects detected person pixels, including a small margin. Detection is imperfect; users should keep the edit box clear of faces and bodies.
- The browser sends a resized photo and binary mask through a locked-down Cloudflare Worker to the public [Black Forest Labs FLUX.1 Fill Space](https://huggingface.co/spaces/black-forest-labs/FLUX.1-Fill-dev). The Worker accepts calls only from the published Cash Crates site and forwards only the API routes needed for this edit.
- A new AI image is generated for each request. The editor restores all pixels outside the edit mask from the decoded original, and exports a PNG at the original dimensions.
- Generation uses a maximum 1,024-pixel long edge. Only the edited region is resampled. The photo's original color profile and metadata are not retained by canvas export.
- Free [Hugging Face ZeroGPU quotas](https://huggingface.co/docs/hub/spaces-zerogpu), queues, and service availability apply. There is no automatic switch to a paid provider or attempt to bypass quotas.
- The external Space may temporarily retain uploaded files according to its policies. This website has no server, database, gallery, tracking, or photo retention.

## Main files

- `app/page.tsx`: upload, placement, status, comparison, and download interface.
- `lib/editor.ts`: segmentation, edit masks, FLUX API, and original-pixel restoration.
- `app/globals.css`: responsive theme.
- `vite.pages.config.ts`: standalone GitHub Pages build.
- `public/models` and `public/vision`: browser segmentation runtime.

## Attribution

Generation: [FLUX.1 Fill](https://huggingface.co/black-forest-labs/FLUX.1-Fill-dev). The hosted model has its own license and terms; consult the model card before adapting this site for commercial use.

Person detection: [Google MediaPipe](https://github.com/google-ai-edge/mediapipe), Apache-2.0. Sample portrait: AI-generated fictional adult; no participant or patient data was used.

## Verification (2026-09-09)

The interface was loaded in Chrome and real, unauthenticated model generation was exercised. The sample image was uploaded through the browser file picker after file access was enabled for the test extension. The model produced a new image; the download saved a PNG at the original dimensions. Desktop and mobile checks accompany deployment. These checks establish a working integration, not guaranteed availability of the third-party free GPU service.

### Quota diagnosis and repair (2026-09-09)

The provider's full queue response confirmed that the anonymous ZeroGPU runs limit was exhausted. The simplified Gradio call endpoint reduced that error to an empty payload. The editor now uses the queue API, reports the actual quota error and queue position, and distinguishes unknown failures from confirmed limits. Five protocol regression tests use the captured quota response and cover success, queue status, and split event frames. No quota reset time is invented and no quota bypass is attempted.

Run all checks with: `node --experimental-strip-types --test tests/flux-protocol.test.mjs tests/hugging-face-worker.test.mjs tests/hugging-face-client.test.mjs tests/build-security.test.mjs`

