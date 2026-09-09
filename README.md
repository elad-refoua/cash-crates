# Cash Crates

A public, free photo editor: upload a JPG, PNG, or WebP, position an edit area beside a person, and generate wooden crates of cash using FLUX.1 Fill. No API key, account, paid backend, or application photo storage.

## Development and GitHub Pages

```sh
npm ci
npm run dev:pages
npm run build:pages
```

GitHub Pages serves the committed `docs/` directory on `main`. After editing source, run `npm run build:pages` and commit both source and `docs/`. Relative URLs support the repository subdirectory. The original Vinext starter remains available but is not the GitHub Pages entrypoint.

## Image processing

- MediaPipe Selfie Segmenter runs locally and protects detected person pixels, including a small margin. Detection is imperfect; users should keep the edit box clear of faces and bodies.
- The browser sends a resized photo and binary mask directly to the public [Black Forest Labs FLUX.1 Fill Space](https://huggingface.co/spaces/black-forest-labs/FLUX.1-Fill-dev).
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
