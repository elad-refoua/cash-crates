# Secure Hugging Face connection for Cash Crates

## Purpose

Cash Crates is a public static website hosted on GitHub Pages. It currently calls the public FLUX.1 Fill Space without authentication, so it receives the anonymous ZeroGPU allowance. The provider has confirmed that this allowance is exhausted.

This change lets the website use the site owner's Hugging Face free-account allowance without publishing the owner's token.

## Chosen architecture

```text
Visitor browser
  -> GitHub Pages editor
  -> Cash Crates Cloudflare Worker
  -> FLUX.1 Fill Hugging Face Space
  -> Cloudflare Worker
  -> Visitor browser
```

The editor continues to run person protection and final pixel compositing in the visitor's browser. The Worker only forwards the image-editing requests to the fixed FLUX.1 Fill Space and attaches the `HF_TOKEN` secret as an authorization header.

## Components

### GitHub Pages editor

`lib/editor.ts` will send the existing upload, queue submission, queue event stream, and generated-image retrieval requests to a worker URL rather than directly to the Hugging Face Space. The editor remains token-free and keeps its current input validation, masking, cancellation, queue messages, and provider-error reporting.

### Cloudflare Worker

The Worker will expose only the required endpoints below. It will not work as a general-purpose HTTP proxy.

| Site endpoint | Hugging Face target | Purpose |
| --- | --- | --- |
| `GET /health` | none | Confirms the Worker is deployed without disclosing secrets. |
| `GET /config` | `GET /config` | Reads the Space API configuration. |
| `POST /upload` | `POST /gradio_api/upload` | Forwards the edited photo and mask. |
| `POST /queue/join` | `POST /gradio_api/queue/join` | Starts a FLUX edit request. |
| `GET /queue/data` | `GET /gradio_api/queue/data` | Streams queue status and the final result. |
| `GET /file` | validated generated-image URL | Retrieves a generated image only from the FLUX Space origin. |

Every forwarding request adds `Authorization: Bearer <HF_TOKEN>`. The Worker validates allowed paths and only permits browser requests from `https://elad-refoua.github.io`. It accepts the existing 15 MB input limit; no photo files, prompts, outputs, or account data are stored by the Worker.

### Secrets and deployment

`HF_TOKEN` is entered by the site owner directly into Cloudflare's encrypted Worker-secret UI. It is never committed to the repository, put into an `.env` file, printed in logs, or accepted from the browser.

The Worker is deployed separately from GitHub Pages. Its public URL is saved as a non-sensitive value in the static site build. If the Worker is unavailable, the editor reports that the authenticated connection is unavailable; it does not silently fall back to an anonymous or paid service.

## Data flow and privacy

1. The visitor selects a photo.
2. The browser creates the person-protection mask locally.
3. The browser uploads the resized photo and mask through the Worker to the public Hugging Face Space.
4. The Worker adds the owner's Hugging Face authentication header and relays the queue stream.
5. The browser retrieves the generated image through the Worker and restores pixels outside the selected mask before download.

Cloudflare and Hugging Face process each edit in transit. Cash Crates will not create a database, gallery, analytics store, or retained photo archive.

## Limits and expected behavior

The Hugging Face free account allowance is currently five GPU minutes per day for the owner's account. It is shared by all visitors using Cash Crates and resets 24 hours after the account's first GPU use for that day. The external provider decides actual generation duration, queue priority, and availability.

When that allowance is exhausted, the site shows the confirmed provider quota message. A new request does not circumvent the limit. No paid provider, credits, or automatic payment method will be added.

## Error handling

- Reject requests from origins other than the published Cash Crates site.
- Reject unsupported methods, paths, missing query values, unexpected file origins, and requests exceeding the site's existing size limit.
- Preserve safe provider status codes and queue messages for the editor, without passing token values or unvalidated response URLs to the browser.
- Return a clear connection error when the Worker has no `HF_TOKEN` secret.
- Keep the editor's current explicit messaging for confirmed ZeroGPU quota, queue progress, cancellation, and unknown provider failures.

## Verification

Before publishing, verification will include:

1. Automated Worker tests for allowed routes, CORS, token omission from responses, target URL validation, and error mapping.
2. Existing queue-protocol tests and TypeScript checks.
3. A local browser test using a Worker development configuration with a non-production test token.
4. A browser test on the public GitHub Pages site after the Worker and secret are configured, using the fictional sample image.

No real visitor photo or patient/participant data will be used for verification.

## User action required at deployment

The user must sign in to Cloudflare and save the Hugging Face token in the `HF_TOKEN` secret field. The user should create a least-privilege Hugging Face read token for this site and enter it only in Cloudflare's secret form, never in chat, source code, GitHub Issues, or a screenshot.
