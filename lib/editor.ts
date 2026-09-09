export type Area = { x: number; y: number; width: number; height: number };
export type Protection = { values: Float32Array; width: number; height: number };
export const SPACE = 'https://black-forest-labs-flux-1-fill-dev.hf.space';
export const DEFAULT_AREA: Area = { x: 0.65, y: 0.47, width: 0.32, height: 0.48 };

export function canvas(width: number, height: number) {
  const el = document.createElement('canvas');
  el.width = width; el.height = height;
  return el;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be opened. Try a JPG, PNG, or WebP photo.'));
    img.src = url;
  });
}

export function toBlob(el: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => el.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the image. Try a smaller photo.')), type, 0.95));
}

let segmenterPromise: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | undefined;
export async function protectPerson(img: HTMLImageElement): Promise<Protection> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(new URL('vision', document.baseURI).href);
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: new URL('models/selfie_segmenter.tflite', document.baseURI).href, delegate: 'CPU' },
      runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    });
  })().catch(error => { segmenterPromise = undefined; throw error; });
  const model = await segmenterPromise;
  const image = canvas(768, Math.max(1, Math.round(768 * img.naturalHeight / img.naturalWidth)));
  image.getContext('2d')!.drawImage(img, 0, 0, image.width, image.height);
  const result = model.segment(image);
  try {
    const mask = result.confidenceMasks?.[0];
    if (!mask) throw new Error('Person protection could not be prepared.');
    return { values: new Float32Array(mask.getAsFloat32Array()), width: mask.width, height: mask.height };
  } finally { result.close(); }
}

export function isProtected(x: number, y: number, protection: Protection | null) {
  if (!protection) return false;
  const px = Math.min(protection.width - 1, Math.max(0, Math.floor(x * protection.width)));
  const py = Math.min(protection.height - 1, Math.max(0, Math.floor(y * protection.height)));
  // Expand the protected boundary slightly to retain hair and clothing edges.
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = px + dx, ny = py + dy;
    if (nx >= 0 && nx < protection.width && ny >= 0 && ny < protection.height && protection.values[ny * protection.width + nx] > 0.2) return true;
  }
  return false;
}

export function inside(x: number, y: number, area: Area) {
  return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
}

export function makeMask(width: number, height: number, area: Area, protection: Protection | null) {
  const el = canvas(width, height), ctx = el.getContext('2d')!;
  const pixels = ctx.createImageData(width, height); let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const allow = inside(x / width, y / height, area) && !isProtected(x / width, y / height, protection);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = allow ? 255 : 0;
    pixels.data[i + 3] = 255;
    if (allow) count++;
  }
  ctx.putImageData(pixels, 0, 0);
  return { mask: el, fraction: count / (width * height) };
}

export function composite(original: HTMLImageElement, generated: HTMLImageElement, mask: HTMLCanvasElement) {
  const w = original.naturalWidth, h = original.naturalHeight;
  const output = canvas(w, h), ctx = output.getContext('2d')!;
  ctx.drawImage(original, 0, 0);
  const base = ctx.getImageData(0, 0, w, h);
  const layer = canvas(w, h), layerCtx = layer.getContext('2d')!;
  layerCtx.drawImage(generated, 0, 0, w, h);
  const edit = layerCtx.getImageData(0, 0, w, h);
  const allowed = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height);
  // Pixels outside the binary edit mask are copied without blending or resampling.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const mi = (Math.floor(y * mask.height / h) * mask.width + Math.floor(x * mask.width / w)) * 4;
    if (allowed.data[mi] !== 255) continue;
    const i = (y * w + x) * 4;
    base.data[i] = edit.data[i]; base.data[i + 1] = edit.data[i + 1]; base.data[i + 2] = edit.data[i + 2]; base.data[i + 3] = edit.data[i + 3];
  }
  ctx.putImageData(base, 0, 0); return output;
}

async function checked(response: Response) {
  if (response.ok) return response;
  if (response.status === 429) throw new Error('The free GPU quota is currently exhausted. Please try again after it resets. There is no charge.');
  if (response.status === 401 || response.status === 403) throw new Error('The free AI service is not accepting this request right now. Please try later, or open the model page below.');
  throw new Error(`The free AI service is temporarily unavailable (${response.status}). Please try again later.`);
}

function generationError(value: unknown) {
  const detail = typeof value === 'string' ? value : value && typeof value === 'object' && 'error' in value ? String(value.error) : '';
  if (/quota|exceeded|GPU.*limit/i.test(detail)) return new Error('Your free GPU allowance has been used. Please try again after the daily quota resets. You will not be charged.');
  if (/queue|busy/i.test(detail)) return new Error('The free GPU queue is full. Please try again in a few minutes.');
  return new Error(detail ? `The model could not finish: ${detail.slice(0, 240)}` : 'The free model could not complete this edit. It may be busy or out of free GPU capacity. Please try again later.');
}

export async function generateCash(original: HTMLImageElement, mask: HTMLCanvasElement, amount: string, signal: AbortSignal, onStatus: (text: string) => void) {
  const input = canvas(mask.width, mask.height); input.getContext('2d')!.drawImage(original, 0, 0, input.width, input.height);
  onStatus('Sending your photo to the free AI service…');
  const form = new FormData();
  form.append('files', await toBlob(input), 'photo.png'); form.append('files', await toBlob(mask), 'edit-area.png');
  const upload = await checked(await fetch(`${SPACE}/gradio_api/upload`, { method: 'POST', body: form, signal }));
  const paths = await upload.json() as string[];
  if (!Array.isArray(paths) || paths.length !== 2 || paths.some(p => typeof p !== 'string')) throw new Error('The service did not accept the photo. Please try again.');
  const file = (path: string) => ({ path, meta: { _type: 'gradio.FileData' } });
  const prompt = `A realistic photograph of ${amount === 'lots' ? 'three' : 'two'} open-top wooden storage crates on the floor. The crates are filled with dozens of small stacks of dollar bills, each stack tied with a paper band. Looking into the open tops, many separate bundles of cash are clearly visible. Plain brown wooden sides with natural wood grain. The crates stand beside the person. Matching perspective, natural lighting and floor shadows.`;
  const submitted = await checked(await fetch(`${SPACE}/gradio_api/call/infer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ data: [{ background: file(paths[0]), layers: [file(paths[1])], composite: file(paths[0]) }, prompt, Math.floor(Math.random() * 2147483647), false, 1024, 1024, 30, 28] }),
  }));
  const event = await submitted.json() as { event_id?: string };
  if (!event.event_id || !/^[a-zA-Z0-9_-]+$/.test(event.event_id)) throw new Error('The service did not start the edit. Please try again later.');
  onStatus('Waiting for a free GPU and generating your crates…');
  const stream = await checked(await fetch(`${SPACE}/gradio_api/call/infer/${event.event_id}`, { signal }));
  if (!stream.body) throw new Error('The connection was interrupted. Please try again.');
  const reader = stream.body.getReader(), decoder = new TextDecoder(); let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const type = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
        const raw = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (type === 'error') { let detail; try { detail = JSON.parse(raw); } catch { detail = raw; } throw generationError(detail); }
        if (type === 'complete') {
          const data = JSON.parse(raw) as [{ url?: string }];
          const url = data?.[0]?.url;
          if (!url || new URL(url).origin !== SPACE) throw new Error('The model returned an unexpected image response.');
          onStatus('Restoring the protected pixels and preparing your download…');
          const response = await checked(await fetch(url, { signal }));
          return response.blob();
        }
      }
      if (done) break;
    }
    throw new Error('The connection ended before the edit finished. Please try again later.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
