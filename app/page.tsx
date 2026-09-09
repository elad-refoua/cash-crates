'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Banknote, Check, ImagePlus, LoaderCircle, LockKeyhole, Move, RotateCcw, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { type Area, type Protection, DEFAULT_AREA, composite, generateCash, loadImage, makeMask, protectPerson, toBlob } from '@/lib/editor';

export default function Home() {
  const [source, setSource] = useState('./demo-before.png');
  const [sample, setSample] = useState(true);
  const [name, setName] = useState('Studio portrait · sample photo');
  const [dimensions, setDimensions] = useState({ w: 1536, h: 1024 });
  const [area, setArea] = useState<Area>(DEFAULT_AREA);
  const [protect, setProtect] = useState(true);
  const [protectionReady, setProtectionReady] = useState(false);
  const [protectionFailed, setProtectionFailed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [originalView, setOriginalView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const original = useRef<HTMLImageElement | null>(null);
  const protection = useRef<Protection | null>(null);
  const currentJob = useRef<AbortController | null>(null);
  const sourceToken = useRef(0);
  const sourceUrl = useRef<string | null>(null);
  const resultUrl = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);
  function clearResult() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null; setResult(null); setOriginalView(false);
  }
  useEffect(() => {
    const token = ++sourceToken.current;
    original.current = null; protection.current = null;
    setProtectionReady(false); setProtectionFailed(false);
    loadImage(source).then(async image => {
      if (token !== sourceToken.current) return;
      original.current = image; setDimensions({ w: image.naturalWidth, h: image.naturalHeight });
      try {
        const mask = await protectPerson(image);
        if (token === sourceToken.current) { protection.current = mask; setProtectionReady(true); }
      } catch { if (token === sourceToken.current) setProtectionFailed(true); }
    }).catch(e => { if (token === sourceToken.current) setError(e.message); });
    return () => { sourceToken.current++; };
  }, [source]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0); const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => { currentJob.current?.abort(); if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current); if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); }, []);
  async function chooseFile(file?: File) {
    if (!file || busy) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Please choose a JPG, PNG, or WebP image. HEIC photos need to be exported as JPG first.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('This photo is too large. Please use a file smaller than 15 MB.'); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      if (img.naturalWidth * img.naturalHeight > 16000000 || Math.max(img.naturalWidth, img.naturalHeight) > 8192) throw new Error('Please use a photo up to 16 megapixels, with neither side longer than 8,192 pixels.');
      if (Math.min(img.naturalWidth, img.naturalHeight) < 256) throw new Error('Please use a photo at least 256 pixels on each side.');
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio < 9 / 16 || ratio > 16 / 9) throw new Error('Please crop your photo to a shape between 9:16 portrait and 16:9 landscape before uploading.');
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current);
      sourceUrl.current = url; clearResult(); setArea(DEFAULT_AREA); setSource(url); setSample(false); setName(file.name);
    } catch (e) { URL.revokeObjectURL(url); setError(e instanceof Error ? e.message : 'Could not open this photo.'); }
    if (input.current) input.current.value = '';
  }
  function moveArea(next: Area) {
    clearResult(); setArea({ ...next, x: Math.max(0, Math.min(1 - next.width, next.x)), y: Math.max(0, Math.min(1 - next.height, next.y)) });
  }
  async function generate() {
    if (busy || !original.current) return;
    if (protect && !protectionReady) { setError(protectionFailed ? 'Automatic person protection is unavailable. Try reloading, or turn it off and keep the edit area clear of the person.' : 'Person protection is still loading. Please wait a moment.'); return; }
    setError(''); setBusy(true); setStatus('Preparing the edit area…');
    const controller = new AbortController(); currentJob.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 240000);
    try {
      const img = original.current, ratio = img.naturalWidth / img.naturalHeight;
      const width = ratio >= 1 ? 1024 : Math.floor(1024 * ratio / 8) * 8;
      const height = ratio >= 1 ? Math.floor(1024 / ratio / 8) * 8 : 1024;
      const { mask, fraction } = makeMask(width, height, area, protect ? protection.current : null);
      if (fraction < 0.015) throw new Error('There is not enough free space here. Move the box away from the person or increase its size.');
      const generatedBlob = await generateCash(img, mask, 'lots', controller.signal, setStatus);
      const generatedUrl = URL.createObjectURL(generatedBlob);
      try {
        const generated = await loadImage(generatedUrl);
        const blob = await toBlob(composite(img, generated, mask));
        clearResult(); const url = URL.createObjectURL(blob); resultUrl.current = url; setResult(url); setOriginalView(false);
      } finally { URL.revokeObjectURL(generatedUrl); }
      setStatus('Your image is ready.');
    } catch (e) {
      setError(controller.signal.aborted ? 'The free GPU service took too long to respond. Please try later; your original photo is still here.' : e instanceof Error ? e.message : 'The edit could not finish. Please try again later.');
    } finally { clearTimeout(timer); currentJob.current = null; setBusy(false); }
  }
  return (
    <main className="studio">
      <header className="topbar"><a className="brand" href="./" aria-label="Cash Crates home"><span className="brand-icon"><Banknote size={25} strokeWidth={1.8} /></span><span>CASH<span className="brand-light">CRATES</span><small>PHOTO STUDIO</small></span></a><span className="free-badge"><i />Free AI editing <span className="desktop-only">· No sign-up</span></span></header>
      <div className="intro"><div><p className="eyebrow">A LITTLE EXTRA MONEY IN THE PICTURE</p><h1>Your photo. <em>More cash.</em></h1></div><p>Add realistic, AI-generated crates of cash.<br />Keep the rest of your photo intact.</p></div>
      <section className="workspace" aria-label="Photo editor">
        <aside className="controls">
          <section className="control-section">
            <h2><span className="step-number">01</span>Your photo</h2>
            <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload a photo" onChange={e => void chooseFile(e.target.files?.[0])} disabled={busy} />
            <Button variant="outline" className={`upload-button ${dragOver ? 'drag-over' : ''}`} disabled={busy} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); void chooseFile(e.dataTransfer.files[0]); }}><ImagePlus /><span>Upload your photo<small>or drop it here · JPG, PNG, WebP</small></span><Upload /></Button>
            <p className="micro">Up to 15 MB. A little empty space beside the person works best.</p>
            {!sample && <button className="text-link" disabled={busy} onClick={() => { clearResult(); setArea(DEFAULT_AREA); setSource('./demo-before.png'); setSample(true); setName('Studio portrait · sample photo'); }}>Use the sample photo</button>}
          </section>
          <section className="control-section">
            <h2><span className="step-number">02</span>Make room for the crates</h2>
            <p className="control-description">Drag the green box onto empty space beside the person.</p>
            <div className="position-actions"><Button variant="outline" disabled={busy} onClick={() => moveArea({ ...area, x: 0.03 })}><ArrowLeft />Place left</Button><Button variant="outline" disabled={busy} onClick={() => moveArea({ ...area, x: 0.97 - area.width })}>Place right<ArrowRight /></Button></div>
            <div className="range-label"><label id="area-size-label">Crate area</label><span>{Math.round(area.width * 100)}% width</span></div>
            <Slider aria-labelledby="area-size-label" min={20} max={60} step={1} value={[Math.round(area.width * 100)]} disabled={busy} onValueChange={v => { const size = (Array.isArray(v) ? v[0] : v) / 100; moveArea({ ...area, width: size, height: Math.min(0.8, size * 1.5) }); }} />
            <div className="protect-row"><ShieldCheck size={19} /><label htmlFor="protect-person">Protect the person</label><Switch id="protect-person" checked={protect} disabled={busy} onCheckedChange={v => { clearResult(); setProtect(v); }} /></div>
            <p className="micro">{protect ? protectionFailed ? 'Protection did not load. Reload or keep the box clear of the person.' : protectionReady ? 'Detected person pixels stay original. Keep the box clear of their face and body.' : 'Loading person protection…' : 'Only the area inside the box can change. Keep it clear of the person.'}</p>
          </section>
          <section className="generate-section">
            <Button className="generate-button" disabled={busy || (protect && !protectionReady && !protectionFailed)} onClick={() => void generate()}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}{busy ? 'Creating your image…' : result ? 'Generate another version' : 'Add crates of cash'}{!busy && <ArrowUpRight className="generate-arrow" />}</Button>
            <p className="service-note">Free shared GPU · Daily limits apply<br />Usually about a minute; queues can take longer.</p>
            <p className="privacy-note"><LockKeyhole size={14} /><span>When you generate, your photo is sent to Hugging Face for processing. This site has no photo gallery or upload storage.</span></p>
          </section>
        </aside>
        <div className="editor-panel">
          <div className="editor-toolbar"><span className="editor-status">{result ? <Check size={16} /> : <i className="status-dot" />}{busy ? 'Generating' : result ? 'Ready to download' : 'Choose where the crates go'}</span><Button variant="ghost" className="reset-button" disabled={busy} onClick={() => { moveArea(DEFAULT_AREA); setError(''); }}><RotateCcw size={15} />Reset area</Button></div>
          <div className="photo-stage"><div className="photo-frame" style={{ aspectRatio: `${dimensions.w} / ${dimensions.h}` }}>
            <img src={result && !originalView ? result : source} alt={result && !originalView ? 'Your photo with AI-generated cash crates added to the selected area' : sample ? 'Synthetic sample portrait of a man in a studio with room beside him' : 'Your original photo'} draggable={false} />
            {sample && <span className="sample-label">SAMPLE PHOTO</span>}
            {!result && <div className={`edit-area ${busy ? 'working' : ''}`} role="slider" tabIndex={busy ? -1 : 0} aria-label="Crate position. Drag to move or use arrow keys." aria-valuetext={`${Math.round(area.x * 100)} percent from left, ${Math.round(area.y * 100)} percent from top`} aria-valuenow={Math.round(area.x * 100)} aria-valuemin={0} aria-valuemax={100} style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }} onPointerDown={e => { if (busy) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ax: area.x, ay: area.y }; }} onPointerMove={e => { if (!drag.current || busy) return; const rect = e.currentTarget.parentElement!.getBoundingClientRect(); moveArea({ ...area, x: drag.current.ax + (e.clientX - drag.current.x) / rect.width, y: drag.current.ay + (e.clientY - drag.current.y) / rect.height }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={e => { if (busy || !e.key.startsWith('Arrow')) return; e.preventDefault(); const d = e.shiftKey ? 0.05 : 0.01; moveArea({ ...area, x: area.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0), y: area.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0) }); }}><span className="area-caption"><Move size={15} />Crates go here</span><i className="corner tl" /><i className="corner tr" /><i className="corner bl" /><i className="corner br" /></div>}
            {busy && <div className="busy-overlay"><LoaderCircle size={30} className="spin" /><span>Creating your cash crates</span><small>{elapsed}s elapsed · Free GPU queue</small></div>}
          </div></div>
          <div className="photo-footer"><span className="filename">{name}<small>{dimensions.w} × {dimensions.h}{result ? ' · PNG export' : ''}</small></span>{result ? <div className="result-actions"><Button variant="outline" onClick={() => setOriginalView(!originalView)}>{originalView ? 'Show result' : 'See original'}</Button><a className="download-button" href={result} download="cash-crates.png"><ArrowDownToLine size={17} />Download PNG</a></div> : <span className="canvas-hint"><Move size={14} />Drag to position · Arrow keys to fine-tune</span>}</div>
          {busy && <p role="status" className="progress-message">{status}</p>}
          {error && <div role="alert" className="error-message"><strong>The edit needs a moment.</strong><p>{error}</p><a href="https://huggingface.co/spaces/black-forest-labs/FLUX.1-Fill-dev" target="_blank" rel="noreferrer">Check the free model<ArrowUpRight size={14} /></a></div>}
          {result && !busy && <p role="status" className="success-message"><Check size={16} />Ready. Pixels outside the edit mask are preserved from your original.</p>}
        </div>
      </section>
      <footer className="site-footer"><span>Made for a little fun. Keep the original.</span><details><summary>About the free AI & your photo</summary><p>Fresh images are generated by <a href="https://huggingface.co/spaces/black-forest-labs/FLUX.1-Fill-dev" target="_blank" rel="noreferrer">FLUX.1 Fill</a> on Hugging Face. This is a free community demo with shared capacity, queues, and daily quotas. Availability can change; no paid service is connected.</p><p>Person detection runs in your browser. Your photo and edit mask are uploaded directly to the model service only when you generate. Hugging Face and the Space process and may temporarily retain those files under their own policies. <a href="https://huggingface.co/privacy" target="_blank" rel="noreferrer">Read their privacy policy.</a> AI edits use up to 1,024 pixels on the long edge; the downloaded PNG retains your original dimensions. Details inside the edited area may be softer.</p><p>The person detector is not perfect. Keep the box away from faces and bodies and check the result before sharing. The sample portrait is synthetic. <a href="https://huggingface.co/docs/hub/spaces-zerogpu" target="_blank" rel="noreferrer">Free GPU quotas</a></p></details></footer>
    </main>
  );
}
