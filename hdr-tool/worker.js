// Web Worker: the actual image-processing pipeline, kept off the main thread
// so a full-size camera export doesn't freeze the tab.
//
// Math is a direct port of _hdr-reference/make_hdr.py's synthesis branch (see
// BRIEF.md section 3), run in linear light, sRGB/BT.709 primaries. The
// Gaussian blur is approximated as the brief explicitly allows: a separable
// box blur computed at reduced resolution, then bilinear-upsampled.

import { decodeExr, ExrParseError } from './exr.js';
import { buildGainMapJpeg, buildUltraHdrJpeg } from './ultrahdr.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function srgbToLinearChannel(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Precompute the 0-255 -> linear lookup table once; every image goes through it.
const SRGB_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) SRGB_LUT[i] = srgbToLinearChannel(i / 255);

function srgbToLinear(imageData) {
  const { data, width, height } = imageData;
  const n = width * height;
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    lin[i * 3 + 0] = SRGB_LUT[data[i * 4 + 0]];
    lin[i * 3 + 1] = SRGB_LUT[data[i * 4 + 1]];
    lin[i * 3 + 2] = SRGB_LUT[data[i * 4 + 2]];
  }
  return lin;
}

function luminance(lin, w, h) {
  const n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = 0.2126 * lin[i * 3] + 0.7152 * lin[i * 3 + 1] + 0.0722 * lin[i * 3 + 2];
  }
  return lum;
}

// ---------------------------------------------------------------------------
// Separable box blur (two passes approximate a Gaussian reasonably well),
// run at reduced resolution and bilinear-upsampled -- brief explicitly
// allows this approximation in place of a true Gaussian blur.
// ---------------------------------------------------------------------------

function boxBlurHoriz(src, w, h, r) {
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      out[row + x] = acc / win;
      const add = clamp(x + r + 1, 0, w - 1);
      const rem = clamp(x - r, 0, w - 1);
      acc += src[row + add] - src[row + rem];
    }
  }
  return out;
}

function boxBlurVert(src, w, h, r) {
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      const add = clamp(y + r + 1, 0, h - 1);
      const rem = clamp(y - r, 0, h - 1);
      acc += src[add * w + x] - src[rem * w + x];
    }
  }
  return out;
}

function boxBlur2(src, w, h, r) {
  return boxBlurVert(boxBlurHoriz(src, w, h, r), w, h, r);
}

function boxDownsample(src, w, h, factor) {
  const rw = Math.max(1, Math.round(w / factor));
  const rh = Math.max(1, Math.round(h / factor));
  const out = new Float32Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    const sy0 = Math.floor((y * h) / rh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / rh));
    for (let x = 0; x < rw; x++) {
      const sx0 = Math.floor((x * w) / rw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / rw));
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < h; sy++) {
        for (let sx = sx0; sx < sx1 && sx < w; sx++) {
          sum += src[sy * w + sx];
          count++;
        }
      }
      out[y * rw + x] = count ? sum / count : 0;
    }
  }
  return { data: out, width: rw, height: rh };
}

function bilinearUpsample(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const sy0 = clamp(Math.floor(sy), 0, sh - 1);
    const sy1 = clamp(sy0 + 1, 0, sh - 1);
    const fy = clamp(sy - sy0, 0, 1);
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const sx0 = clamp(Math.floor(sx), 0, sw - 1);
      const sx1 = clamp(sx0 + 1, 0, sw - 1);
      const fx = clamp(sx - sx0, 0, 1);
      const v00 = src[sy0 * sw + sx0];
      const v10 = src[sy0 * sw + sx1];
      const v01 = src[sy1 * sw + sx0];
      const v11 = src[sy1 * sw + sx1];
      const v0 = v00 * (1 - fx) + v10 * fx;
      const v1 = v01 * (1 - fx) + v11 * fx;
      out[y * dw + x] = v0 * (1 - fy) + v1 * fy;
    }
  }
  return out;
}

// Approximates gaussianBlur(lum, sigma) from make_hdr.py: downsamples by a
// factor proportional to sigma, runs two small box-blur passes, upsamples.
function softBlur(lum, w, h, sigma) {
  const factor = Math.max(1, Math.round(sigma / 3));
  if (factor === 1) return boxBlur2(boxBlur2(lum, w, h, 3), w, h, 3);
  const { data, width: rw, height: rh } = boxDownsample(lum, w, h, factor);
  const blurred = boxBlur2(boxBlur2(data, rw, rh, 3), rw, rh, 3);
  return bilinearUpsample(blurred, rw, rh, w, h);
}

function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function ramp(x, a, b) {
  return smoothstep((x - a) / (b - a));
}

// ---------------------------------------------------------------------------
// HDR synthesis (make_hdr.py's "clipped EXR -> synthesise highlight headroom"
// branch) -- the only path exercised when no usable EXR is supplied.
// ---------------------------------------------------------------------------

function synthesizeHdr(sdrLin, w, h, skyBoost, lightBoost) {
  const n = w * h;
  const lum = luminance(sdrLin, w, h);
  const sigma = Math.max(3, w / 400);
  const soft = softBlur(lum, w, h, sigma);
  const hdrLin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const sky = ramp(soft[i], 0.45, 0.85);
    const lights = ramp(lum[i], 0.97, 1.0) * ramp(soft[i], 0.6, 0.9);
    const skyB = 1 + (skyBoost - 1) * sky;
    const lightB = 1 + (lightBoost - 1) * lights;
    const boost = Math.max(skyB, lightB);
    hdrLin[i * 3] = sdrLin[i * 3] * boost;
    hdrLin[i * 3 + 1] = sdrLin[i * 3 + 1] * boost;
    hdrLin[i * 3 + 2] = sdrLin[i * 3 + 2] * boost;
  }
  return hdrLin;
}

// ---------------------------------------------------------------------------
// Gain map: half resolution, log2(hdrY/sdrY), normalized to [0,255].
// ---------------------------------------------------------------------------

const K_SDR = 1e-7;
const K_HDR = 1e-7;

function computeGainMap(sdrLin, hdrLin, w, h, maxLog) {
  const gw = Math.max(1, Math.round(w / 2));
  const gh = Math.max(1, Math.round(h / 2));
  const data = new Uint8ClampedArray(gw * gh * 4);
  for (let gy = 0; gy < gh; gy++) {
    const sy0 = Math.floor((gy * h) / gh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((gy + 1) * h) / gh));
    for (let gx = 0; gx < gw; gx++) {
      const sx0 = Math.floor((gx * w) / gw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((gx + 1) * w) / gw));
      let sdrSum = 0;
      let hdrSum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < h; sy++) {
        for (let sx = sx0; sx < sx1 && sx < w; sx++) {
          const idx = (sy * w + sx) * 3;
          sdrSum += 0.2126 * sdrLin[idx] + 0.7152 * sdrLin[idx + 1] + 0.0722 * sdrLin[idx + 2];
          hdrSum += 0.2126 * hdrLin[idx] + 0.7152 * hdrLin[idx + 1] + 0.0722 * hdrLin[idx + 2];
          count++;
        }
      }
      const sdrY = count ? sdrSum / count : 0;
      const hdrY = count ? hdrSum / count : 0;
      const g = Math.log2((hdrY + K_HDR) / (sdrY + K_SDR));
      const n = maxLog > 0 ? clamp(g / maxLog, 0, 1) : 0;
      const v = Math.round(n * 255);
      const idx = (gy * gw + gx) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return { data, width: gw, height: gh };
}

// ---------------------------------------------------------------------------
// JPEG encoding via OffscreenCanvas
// ---------------------------------------------------------------------------

async function encodeJpeg({ data, width, height }, quality) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function processOne(msg, postProgress) {
  const { sdrBytes, sdrMime, exrBytes, skyBoost, lightBoost, targetWidth, wantGlowMap } = msg;

  postProgress('decode', 0.05);
  const sdrBlob = new Blob([sdrBytes], { type: sdrMime || 'image/jpeg' });
  let bitmap;
  if (targetWidth) {
    const probe = await createImageBitmap(sdrBlob);
    const targetHeight = Math.max(1, Math.round((probe.height * targetWidth) / probe.width));
    probe.close();
    bitmap = await createImageBitmap(sdrBlob, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'high',
    });
  } else {
    bitmap = await createImageBitmap(sdrBlob);
  }
  const w = bitmap.width;
  const h = bitmap.height;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, w, h);

  postProgress('linearize', 0.15);
  const sdrLin = srgbToLinear(imageData);

  let hdrLin = null;
  let maxLog = 0;
  let usedExr = false;
  let exrNote = null;

  if (exrBytes) {
    try {
      const exr = await decodeExr(exrBytes);
      let exrMax = 0;
      const en = exr.R.length;
      for (let i = 0; i < en; i++) {
        if (exr.R[i] > exrMax) exrMax = exr.R[i];
        if (exr.G[i] > exrMax) exrMax = exr.G[i];
        if (exr.B[i] > exrMax) exrMax = exr.B[i];
      }
      if (exrMax > 1.0 && exr.width === w && exr.height === h) {
        hdrLin = new Float32Array(w * h * 3);
        for (let i = 0; i < w * h; i++) {
          hdrLin[i * 3] = exr.R[i];
          hdrLin[i * 3 + 1] = exr.G[i];
          hdrLin[i * 3 + 2] = exr.B[i];
        }
        usedExr = true;
        let maxRatio = 1;
        for (let i = 0; i < w * h; i++) {
          const idx = i * 3;
          const sdrY = 0.2126 * sdrLin[idx] + 0.7152 * sdrLin[idx + 1] + 0.0722 * sdrLin[idx + 2];
          const hdrY = 0.2126 * hdrLin[idx] + 0.7152 * hdrLin[idx + 1] + 0.0722 * hdrLin[idx + 2];
          const ratio = (hdrY + K_HDR) / (sdrY + K_SDR);
          if (ratio > maxRatio) maxRatio = ratio;
        }
        maxLog = Math.log2(Math.max(maxRatio, 1.0001));
      } else if (exrMax <= 1.0) {
        exrNote = "Your EXR has no extra highlight data, so the glow is created from your photo.";
      } else {
        exrNote = "Your EXR doesn't match your photo's size, so the glow is created from your photo.";
      }
    } catch (e) {
      if (e instanceof ExrParseError) throw e;
      exrNote = "Couldn't read your EXR, so the glow is created from your photo.";
    }
  }

  if (!hdrLin) {
    postProgress('synthesize', 0.35);
    hdrLin = synthesizeHdr(sdrLin, w, h, skyBoost, lightBoost);
    maxLog = Math.log2(Math.max(skyBoost, lightBoost));
  }

  postProgress('gainmap', 0.6);
  const gainMap = computeGainMap(sdrLin, hdrLin, w, h, maxLog);

  postProgress('encode', 0.75);
  const sdrJpegBytes = await encodeJpeg(imageData, 0.95);
  const gainMapJpegBytesRaw = await encodeJpeg(gainMap, 0.9);

  const metadata = {
    gainMapMin: 0,
    gainMapMax: maxLog,
    gamma: 1,
    offsetSdr: K_SDR,
    offsetHdr: K_HDR,
    hdrCapacityMin: 0,
    hdrCapacityMax: maxLog,
  };

  postProgress('assemble', 0.9);
  const gainMapJpeg = buildGainMapJpeg(gainMapJpegBytesRaw, metadata);
  const finalBytes = buildUltraHdrJpeg(sdrJpegBytes, gainMapJpeg, metadata);

  postProgress('done', 1.0);
  return {
    finalBytes,
    glowMapPreviewBytes: wantGlowMap ? gainMapJpegBytesRaw : null,
    usedExr,
    exrNote,
    maxLog,
    width: w,
    height: h,
  };
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type !== 'process') return;
  try {
    const result = await processOne(msg, (stage, fraction) => {
      self.postMessage({ type: 'progress', id: msg.id, stage, fraction });
    });
    const transfers = [result.finalBytes.buffer];
    if (result.glowMapPreviewBytes) transfers.push(result.glowMapPreviewBytes.buffer);
    self.postMessage(
      {
        type: 'result',
        id: msg.id,
        finalBytes: result.finalBytes,
        glowMapPreviewBytes: result.glowMapPreviewBytes,
        usedExr: result.usedExr,
        exrNote: result.exrNote,
        maxLog: result.maxLog,
        width: result.width,
        height: result.height,
      },
      transfers
    );
  } catch (e) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      message: e.message,
      isExrError: e instanceof ExrParseError || e.name === 'ExrParseError',
    });
  }
};
