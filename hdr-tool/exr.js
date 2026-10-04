// Minimal OpenEXR reader: single-part scanline images only, NONE/ZIP/ZIPS
// compression, HALF/FLOAT channels R, G, B(, A).
//
// File structure (magic, version, attributes, channel list, scanline offset
// table, scanline blocks) and the ZIP predictor/byte-interleave algorithm are
// verified against AcademySoftwareFoundation/openexr source
// (src/lib/OpenEXR/ImfZip.cpp, ImfChannelListAttribute.cpp). All multi-byte
// values in an EXR file are little-endian.

export class ExrParseError extends Error {}

const MAGIC = 0x01312f76; // read as little-endian uint32

const COMPRESSION_NAMES = [
  'NONE',
  'RLE',
  'ZIPS',
  'ZIP',
  'PIZ',
  'PXR24',
  'B44',
  'B44A',
  'DWAA',
  'DWAB',
];

function asciiString(bytes, start, end) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function findNull(bytes, start) {
  let i = start;
  while (bytes[i] !== 0) i++;
  return i;
}

// Undoes OpenEXR's ZIP predictor (running sum) then de-interleaves the two
// halves back into original byte order. Matches ImfZip.cpp's `uncompress`
// (reconstruct_scalar + interleave_scalar) exactly.
function undoPredictorAndInterleave(buf) {
  const n = buf.length;
  for (let i = 1; i < n; i++) {
    buf[i] = (buf[i - 1] + buf[i] - 128) & 0xff;
  }
  const half = (n + 1) >> 1;
  const out = new Uint8Array(n);
  let t1 = 0;
  let t2 = half;
  let s = 0;
  while (true) {
    if (s < n) out[s++] = buf[t1++];
    else break;
    if (s < n) out[s++] = buf[t2++];
    else break;
  }
  return out;
}

async function inflateZlib(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  let v;
  if (e === 0) {
    v = Math.pow(2, -14) * (f / 1024);
  } else if (e === 0x1f) {
    v = f ? NaN : Infinity;
  } else {
    v = Math.pow(2, e - 15) * (1 + f / 1024);
  }
  return s ? -v : v;
}

function bytesPerSample(pixelType) {
  return pixelType === 1 ? 2 : 4; // HALF=2 bytes, FLOAT/UINT=4 bytes
}

function parseAttributes(bytes, view, pos) {
  const attrs = {};
  while (true) {
    const nameEnd = findNull(bytes, pos);
    const name = asciiString(bytes, pos, nameEnd);
    pos = nameEnd + 1;
    if (name === '') break;
    const typeEnd = findNull(bytes, pos);
    const type = asciiString(bytes, pos, typeEnd);
    pos = typeEnd + 1;
    const size = view.getInt32(pos, true);
    pos += 4;
    attrs[name] = { type, start: pos, size };
    pos += size;
  }
  return { attrs, headerEnd: pos };
}

function parseChannelList(bytes, view, chAttr) {
  const channels = [];
  let p = chAttr.start;
  const end = chAttr.start + chAttr.size;
  while (p < end) {
    const nameEnd = findNull(bytes, p);
    const name = asciiString(bytes, p, nameEnd);
    p = nameEnd + 1;
    if (name === '') break;
    const type = view.getInt32(p, true);
    p += 4;
    p += 1; // pLinear
    p += 3; // reserved
    const xSampling = view.getInt32(p, true);
    p += 4;
    const ySampling = view.getInt32(p, true);
    p += 4;
    channels.push({ name, type, xSampling, ySampling });
  }
  return channels;
}

/**
 * Decodes a single-part scanline OpenEXR file into { width, height, R, G, B, A }
 * where R/G/B are Float32Array(width*height) of linear values, and A is the
 * same or null if the file has no alpha channel.
 */
export async function decodeExr(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  if (view.getUint32(0, true) !== MAGIC) {
    throw new ExrParseError('Not an OpenEXR file.');
  }
  const versionField = view.getUint32(4, true);
  const flags = versionField >>> 8;
  if (flags & 0x200) {
    throw new ExrParseError('Tiled EXR files are not supported. Export a scanline EXR.');
  }
  if (flags & 0x1000) {
    throw new ExrParseError('Multi-part EXR files are not supported. Export a single-part scanline EXR.');
  }

  const { attrs, headerEnd } = parseAttributes(bytes, view, 8);
  for (const required of ['channels', 'compression', 'dataWindow']) {
    if (!(required in attrs)) {
      throw new ExrParseError(`EXR file is missing the required "${required}" attribute.`);
    }
  }

  const compressionByte = bytes[attrs.compression.start];
  const compressionName = COMPRESSION_NAMES[compressionByte] || `unknown(${compressionByte})`;
  if (compressionName !== 'NONE' && compressionName !== 'ZIP' && compressionName !== 'ZIPS') {
    throw new ExrParseError('Export EXR with ZIP compression');
  }
  const linesPerBlock = compressionName === 'ZIP' ? 16 : 1;

  const dw = attrs.dataWindow;
  const xMin = view.getInt32(dw.start + 0, true);
  const yMin = view.getInt32(dw.start + 4, true);
  const xMax = view.getInt32(dw.start + 8, true);
  const yMax = view.getInt32(dw.start + 12, true);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width <= 0 || height <= 0) {
    throw new ExrParseError('EXR file has an invalid data window.');
  }

  const channels = parseChannelList(bytes, view, attrs.channels);
  const channelIndex = {};
  channels.forEach((c) => {
    channelIndex[c.name] = c;
  });
  for (const req of ['R', 'G', 'B']) {
    if (!(req in channelIndex)) throw new ExrParseError(`EXR file is missing the "${req}" channel.`);
    if (channelIndex[req].xSampling !== 1 || channelIndex[req].ySampling !== 1) {
      throw new ExrParseError(`Subsampled "${req}" channel is not supported.`);
    }
  }

  const numBlocks = Math.ceil(height / linesPerBlock);
  const offsetTableStart = headerEnd;
  const offsets = new Array(numBlocks);
  for (let i = 0; i < numBlocks; i++) {
    const p = offsetTableStart + i * 8;
    const lo = view.getUint32(p, true);
    const hi = view.getUint32(p + 4, true);
    offsets[i] = lo + hi * 4294967296;
  }

  const out = {
    width,
    height,
    R: new Float32Array(width * height),
    G: new Float32Array(width * height),
    B: new Float32Array(width * height),
    A: 'A' in channelIndex ? new Float32Array(width * height) : null,
  };

  const rowBytes = channels.reduce((sum, c) => sum + width * bytesPerSample(c.type), 0);

  for (let b = 0; b < numBlocks; b++) {
    const blockStart = offsets[b];
    const blockY = view.getInt32(blockStart, true);
    const packedSize = view.getInt32(blockStart + 4, true);
    const packed = bytes.subarray(blockStart + 8, blockStart + 8 + packedSize);

    const linesInBlock = Math.min(linesPerBlock, yMax - blockY + 1);
    const expectedRawSize = rowBytes * linesInBlock;

    let raw;
    if (compressionName === 'NONE') {
      raw = packed;
    } else {
      const inflated = await inflateZlib(packed);
      raw = undoPredictorAndInterleave(inflated);
    }
    if (raw.length !== expectedRawSize) {
      throw new ExrParseError(
        `EXR scanline block has unexpected size (got ${raw.length}, expected ${expectedRawSize}).`
      );
    }

    const rowView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    let off = 0;
    for (let line = 0; line < linesInBlock; line++) {
      const rowY = blockY + line - yMin;
      for (const c of channels) {
        const dest = out[c.name];
        const bps = bytesPerSample(c.type);
        if (!dest) {
          off += bps * width;
          continue;
        }
        const rowBase = rowY * width;
        for (let x = 0; x < width; x++) {
          let v;
          if (c.type === 1) {
            v = halfToFloat(rowView.getUint16(off, true));
          } else if (c.type === 2) {
            v = rowView.getFloat32(off, true);
          } else {
            v = rowView.getUint32(off, true);
          }
          dest[rowBase + x] = v;
          off += bps;
        }
      }
    }
  }

  return out;
}

export const _internal = { undoPredictorAndInterleave, halfToFloat, parseAttributes, parseChannelList };
