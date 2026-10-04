// Main-thread UI wiring for the HDR Glow tool. The actual image processing
// runs in worker.js, off this thread, so a full-size export doesn't freeze
// the tab. Photos never leave the browser: files are read and processed
// entirely client-side, with no network requests involved.

const sdrInput = document.getElementById('sdr-input');
const exrInput = document.getElementById('exr-input');
const sdrDropzone = document.getElementById('sdr-dropzone');
const exrDropzone = document.getElementById('exr-dropzone');
const sdrPreview = document.getElementById('sdr-preview');
const exrPreview = document.getElementById('exr-preview');
const exrStatusNote = document.getElementById('exr-status-note');
const skySlider = document.getElementById('sky-slider');
const lightSlider = document.getElementById('light-slider');
const skyValue = document.getElementById('sky-value');
const lightValue = document.getElementById('light-value');
const resultImg = document.getElementById('result-preview');
const resultEmpty = document.getElementById('result-empty');
const glowMapImg = document.getElementById('glowmap-preview');
const glowMapEmpty = document.getElementById('glowmap-empty');
const progressEl = document.getElementById('hdr-progress');
const progressFill = document.getElementById('hdr-progress-fill');
const progressLabel = document.getElementById('hdr-progress-label');
const downloadInstagramBtn = document.getElementById('download-instagram');
const downloadFullBtn = document.getElementById('download-full');

const STAGE_LABELS = {
  decode: 'Decoding…',
  linearize: 'Linearizing…',
  synthesize: 'Synthesizing highlights…',
  gainmap: 'Computing gain map…',
  encode: 'Encoding JPEGs…',
  assemble: 'Assembling HDR file…',
  done: 'Done',
};

const PREVIEW_WIDTH = 480;

let sdrFile = null;
let exrFile = null;
let sdrBaseName = 'photo';
let previewDebounceTimer = null;
let previewRunId = 0;
let resultUrl = null;
let glowMapUrl = null;

function setupDropzone(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) onFile(input.files[0]);
  });
}

function handleSdrFile(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) {
    window.alert('Please choose a JPEG or PNG photo.');
    return;
  }
  sdrFile = file;
  sdrBaseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  sdrPreview.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
  sdrDropzone.classList.add('has-file');
  downloadInstagramBtn.disabled = false;
  downloadFullBtn.disabled = false;
  schedulePreview();
}

function handleExrFile(file) {
  if (!/\.exr$/i.test(file.name)) {
    window.alert('Please choose an .exr file.');
    return;
  }
  exrFile = file;
  exrDropzone.classList.add('has-file');
  exrPreview.textContent = file.name;
  schedulePreview();
}

setupDropzone(sdrDropzone, sdrInput, handleSdrFile);
setupDropzone(exrDropzone, exrInput, handleExrFile);

skySlider.addEventListener('input', () => {
  skyValue.textContent = Number(skySlider.value).toFixed(1) + '×';
  schedulePreview();
});
lightSlider.addEventListener('input', () => {
  lightValue.textContent = Number(lightSlider.value).toFixed(1) + '×';
  schedulePreview();
});

function schedulePreview() {
  if (!sdrFile) return;
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(runPreview, 250);
}

function updateProgress(stage, fraction) {
  progressEl.hidden = false;
  progressFill.style.width = `${Math.round(fraction * 100)}%`;
  progressLabel.textContent = STAGE_LABELS[stage] || stage;
}

function hideProgressSoon() {
  setTimeout(() => {
    progressEl.hidden = true;
  }, 400);
}

function showExrNote(text) {
  exrStatusNote.textContent = text;
  exrStatusNote.hidden = false;
}

function hideExrNote() {
  exrStatusNote.hidden = true;
}

async function runPipeline({ targetWidth, wantGlowMap }) {
  const sdrBytes = await sdrFile.arrayBuffer();
  const exrBytes = exrFile ? await exrFile.arrayBuffer() : null;

  const worker = new Worker('./worker.js', { type: 'module' });
  const result = await new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === 'progress') updateProgress(msg.stage, msg.fraction);
      else if (msg.type === 'result') resolve(msg);
      else if (msg.type === 'error') {
        reject(Object.assign(new Error(msg.message), { isExrError: msg.isExrError }));
      }
    };
    worker.onerror = (e) => reject(e.error || new Error(e.message));

    const payload = {
      type: 'process',
      id: 1,
      sdrBytes,
      sdrMime: sdrFile.type,
      exrBytes,
      skyBoost: Number(skySlider.value),
      lightBoost: Number(lightSlider.value),
      targetWidth,
      wantGlowMap,
    };
    const transferList = [sdrBytes];
    if (exrBytes) transferList.push(exrBytes);
    worker.postMessage(payload, transferList);
  });
  worker.terminate();
  return result;
}

function setResultImages(result) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(new Blob([result.finalBytes], { type: 'image/jpeg' }));
  resultImg.src = resultUrl;
  resultEmpty.hidden = true;

  if (result.glowMapPreviewBytes) {
    if (glowMapUrl) URL.revokeObjectURL(glowMapUrl);
    glowMapUrl = URL.createObjectURL(new Blob([result.glowMapPreviewBytes], { type: 'image/jpeg' }));
    glowMapImg.src = glowMapUrl;
    glowMapEmpty.hidden = true;
  }
}

async function runPreview() {
  const myRunId = ++previewRunId;
  try {
    const result = await runPipeline({ targetWidth: PREVIEW_WIDTH, wantGlowMap: true });
    if (myRunId !== previewRunId) return; // superseded by a newer preview request
    setResultImages(result);
    if (result.exrNote) showExrNote(result.exrNote);
    else hideExrNote();
  } catch (e) {
    if (myRunId !== previewRunId) return;
    if (e.isExrError) showExrNote(e.message);
    else console.error('HDR preview failed:', e);
  } finally {
    if (myRunId === previewRunId) hideProgressSoon();
  }
}

async function download(targetWidth, suffix) {
  if (!sdrFile) return;
  const btn = targetWidth ? downloadInstagramBtn : downloadFullBtn;
  btn.disabled = true;
  try {
    const result = await runPipeline({ targetWidth, wantGlowMap: false });
    const blob = new Blob([result.finalBytes], { type: 'image/jpeg' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sdrBaseName}_HDR_${suffix}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    if (result.exrNote) showExrNote(result.exrNote);
  } catch (e) {
    if (e.isExrError) showExrNote(e.message);
    else window.alert('Something went wrong building the HDR file: ' + e.message);
  } finally {
    btn.disabled = false;
    hideProgressSoon();
  }
}

downloadInstagramBtn.addEventListener('click', () => download(1080, 'instagram'));
downloadFullBtn.addEventListener('click', () => download(null, 'full'));
