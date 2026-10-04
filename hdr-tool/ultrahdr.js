// Pure-JS Ultra HDR (ISO 21496-1 gain-map) JPEG container writer.
//
// Byte layout verified directly against a known-good reference file
// (_hdr-reference/reference_HDR_instagram.jpg, made by google/libultrahdr v2.0.2):
//   - segment order, XMP text, the 34-byte ISO version marker, the 88-byte MPF
//     segment, and the 91-byte ISO gain-map metadata payload all match byte-for-byte.
//   - the float->rational-fraction algorithm below is a direct port of
//     floatToUnsignedFractionImpl / floatToSignedFraction from libultrahdr v2.0.2's
//     lib/src/gainmapmath.cpp (continued-fraction best-rational-approximation).
// See _hdr-reference/BRIEF.md and _hdr-reference/test.html for the verification.

// A small standard sRGB (IEC 61966-2-1) ICC profile, lcms-generated, vendored here
// so the Instagram/full-size renditions (always re-encoded via OffscreenCanvas,
// which never embeds a profile) carry a correct colour profile. Public, standard,
// freely-redistributable profile data — not user-specific.
const SRGB_ICC_BASE64 =
  'AAACVGxjbXMEMAAAbW50clJHQiBYWVogB+oACgADAA4AKAApYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWxjbXMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA+Y3BydAAAAUgAAABMd3RwdAAAAZQAAAAUY2hhZAAAAagAAAAsclhZWgAAAdQAAAAUYlhZWgAAAegAAAAUZ1hZWgAAAfwAAAAUclRSQwAAAhAAAAAgZ1RSQwAAAhAAAAAgYlRSQwAAAhAAAAAgY2hybQAAAjAAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAiAAAAHABzAFIARwBCACAASQBFAEMANgAxADkANgA2AC0AMgAuADEAAG1sdWMAAAAAAAAAAQAAAAxlblVTAAAAMAAAABwATgBvACAAYwBvAHAAeQByAGkAZwBoAHQALAAgAHUAcwBlACAAZgByAGUAZQBsAHlYWVogAAAAAAAA9tYAAQAAAADTLXNmMzIAAAAAAAEMQgAABd7///MlAAAHkwAA/ZD///uh///9ogAAA9wAAMBuWFlaIAAAAAAAAG+gAAA49QAAA5BYWVogAAAAAAAAJJ8AAA+EAAC2w1hZWiAAAAAAAABilwAAt4cAABjZcGFyYQAAAAAAAwAAAAJmZgAA8qcAAA1ZAAAT0AAACltjaHJtAAAAAAADAAAAAKPXAABUewAATM0AAJmaAAAmZgAAD1w=';

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function strBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concatBytes(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function u16be(n) {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function u32be(n) {
  // bitwise ops on values > 2^31 go through ToInt32 in JS, so build with division/mod
  // instead of (n >>> 24) etc. for values up to 2^32-1.
  const b = new Uint8Array(4);
  b[0] = Math.floor(n / 0x1000000) & 0xff;
  b[1] = (n >> 16) & 0xff;
  b[2] = (n >> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function i32be(n) {
  return u32be(n < 0 ? n + 0x100000000 : n);
}

// ---------------------------------------------------------------------------
// JPEG APPn segment builders
// ---------------------------------------------------------------------------

function appSegment(markerByte, identBytes, payloadBytes) {
  const body = concatBytes([identBytes, payloadBytes]);
  const len = body.length + 2; // length field counts itself
  if (len > 0xffff) throw new Error('APP segment too large');
  return concatBytes([new Uint8Array([0xff, markerByte]), u16be(len), body]);
}

const XMP_IDENT = strBytes('http://ns.adobe.com/xap/1.0/\0');
const ISO_IDENT = strBytes('urn:iso:std:iso:ts:21496:-1\0');

// ---------------------------------------------------------------------------
// float32 -> best rational approximation (continued fractions).
// Direct port of libultrahdr v2.0.2 gainmapmath.cpp. Verified byte-exact
// against the reference file's metadata for GainMapMax=2.58496, Gamma=1,
// OffsetSDR/HDR=1e-7, GainMapMin/HDRCapacityMin=0.
// ---------------------------------------------------------------------------

function floatToUnsignedFractionImpl(v, maxNumerator) {
  v = Math.fround(v);
  if (Number.isNaN(v) || v < 0 || v > maxNumerator) return null;

  const maxD = v <= 1 ? 0xffffffff : Math.floor(maxNumerator / v);
  let denominator = 1;
  let previousD = 0;
  let currentV = v - Math.floor(v);
  let numerator = 0;
  const maxIter = 39;

  for (let iter = 0; iter < maxIter; iter++) {
    const numeratorDouble = denominator * v;
    if (numeratorDouble > maxNumerator) return null;
    numerator = Math.floor(numeratorDouble + 0.5);
    if (Math.abs(numeratorDouble - numerator) === 0) return [numerator, denominator];
    currentV = 1 / currentV;
    const newD = previousD + Math.floor(currentV) * denominator;
    if (newD > maxD) return [numerator, denominator];
    previousD = denominator;
    if (newD > 0xffffffff) return null;
    denominator = newD;
    currentV -= Math.floor(currentV);
  }
  numerator = Math.floor(denominator * v + 0.5);
  return [numerator, denominator];
}

function floatToSignedFraction(v) {
  v = Math.fround(v);
  const r = floatToUnsignedFractionImpl(Math.abs(v), 0x7fffffff);
  if (!r) return null;
  let [num, den] = r;
  if (v < 0) num = -num;
  return [num, den];
}

function floatToUnsignedFraction(v) {
  return floatToUnsignedFractionImpl(v, 0xffffffff);
}

// ---------------------------------------------------------------------------
// Number formatting matching the reference XMP's text (C-style "%g", 6 sig figs)
// ---------------------------------------------------------------------------

export function formatG(value, sig = 6) {
  if (value === 0) return '0';
  const neg = value < 0;
  const abs = Math.abs(value);
  let exp = Math.floor(Math.log10(abs));
  // guard log10 rounding at powers of ten, e.g. log10(1000) can land at 2.9999999
  if (Math.pow(10, exp) > abs) exp -= 1;
  if (Math.pow(10, exp + 1) <= abs) exp += 1;

  let s;
  if (exp < -4 || exp >= sig) {
    let mantissa = abs / Math.pow(10, exp);
    let mstr = mantissa.toPrecision(sig);
    if (parseFloat(mstr) >= 10) {
      exp += 1;
      mstr = (mantissa / 10).toPrecision(sig);
    }
    mstr = mstr.replace(/\.?0+$/, '');
    const expStr = (exp >= 0 ? '+' : '-') + String(Math.abs(exp)).padStart(2, '0');
    s = mstr + 'e' + expStr;
  } else {
    const decimals = Math.max(sig - 1 - exp, 0);
    s = abs.toFixed(decimals);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return (neg ? '-' : '') + s;
}

// ---------------------------------------------------------------------------
// XMP builders (exact text verified against the reference file)
// ---------------------------------------------------------------------------

function buildPrimaryXmpXml(gainMapByteLength) {
  return (
    `<x:xmpmeta\n` +
    `  xmlns:x="adobe:ns:meta/"\n` +
    `  x:xmptk="Adobe XMP Core 5.1.2">\n` +
    `  <rdf:RDF\n` +
    `    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `    <rdf:Description\n` +
    `      xmlns:Container="http://ns.google.com/photos/1.0/container/"\n` +
    `      xmlns:Item="http://ns.google.com/photos/1.0/container/item/"\n` +
    `      xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"\n` +
    `      hdrgm:Version="1.0">\n` +
    `      <Container:Directory>\n` +
    `        <rdf:Seq>\n` +
    `          <rdf:li\n` +
    `            rdf:parseType="Resource">\n` +
    `            <Container:Item\n` +
    `              Item:Semantic="Primary"\n` +
    `              Item:Mime="image/jpeg"/>\n` +
    `          </rdf:li>\n` +
    `          <rdf:li\n` +
    `            rdf:parseType="Resource">\n` +
    `            <Container:Item\n` +
    `              Item:Semantic="GainMap"\n` +
    `              Item:Mime="image/jpeg"\n` +
    `              Item:Length="${gainMapByteLength}"/>\n` +
    `          </rdf:li>\n` +
    `        </rdf:Seq>\n` +
    `      </Container:Directory>\n` +
    `    </rdf:Description>\n` +
    `  </rdf:RDF>\n` +
    `</x:xmpmeta>\n`
  );
}

function buildGainMapXmpXml(m) {
  return (
    `<x:xmpmeta\n` +
    `  xmlns:x="adobe:ns:meta/"\n` +
    `  x:xmptk="Adobe XMP Core 5.1.2">\n` +
    `  <rdf:RDF\n` +
    `    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `    <rdf:Description\n` +
    `      rdf:about=""\n` +
    `      xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"\n` +
    `      hdrgm:Version="1.0"\n` +
    `      hdrgm:GainMapMin="${formatG(m.gainMapMin)}"\n` +
    `      hdrgm:GainMapMax="${formatG(m.gainMapMax)}"\n` +
    `      hdrgm:Gamma="${formatG(m.gamma)}"\n` +
    `      hdrgm:OffsetSDR="${formatG(m.offsetSdr)}"\n` +
    `      hdrgm:OffsetHDR="${formatG(m.offsetHdr)}"\n` +
    `      hdrgm:HDRCapacityMin="${formatG(m.hdrCapacityMin)}"\n` +
    `      hdrgm:HDRCapacityMax="${formatG(m.hdrCapacityMax)}"\n` +
    `      hdrgm:BaseRenditionIsHDR="False"/>\n` +
    `  </rdf:RDF>\n` +
    `</x:xmpmeta>\n`
  );
}

// ---------------------------------------------------------------------------
// ISO 21496-1 segments
// ---------------------------------------------------------------------------

// The 34-byte version-marker segment that sits in the primary image, right
// after the ICC profile: identifier + min/writer version (both 0).
function buildIso34Segment() {
  const payload = concatBytes([u16be(0), u16be(0)]);
  return appSegment(0xe2, ISO_IDENT, payload);
}

// The binary gain-map metadata segment (91-byte segment in the reference,
// i.e. 89-byte body after the 2-byte length field).
//
// Field order and flags verified against google/libultrahdr v2.0.2
// (lib/src/gainmapmetadata.cpp encodeGainmapMetadata): our gain maps are
// always single-channel/greyscale (R=G=B) and never backward-direction, so
// channelCount is always 1 and flags is always kUseBaseColorSpaceMask (0x40)
// with no other bits set -- verified to match the reference exactly.
function buildIso91Segment(m) {
  const FLAGS_USE_BASE_COLOR_SPACE = 0x40;

  // m.gainMapMin/Max and m.hdrCapacityMin/Max are already log2 "stops" values,
  // exactly like the hdrgm:* XMP attributes above (e.g. 2.58496 == log2(6)) --
  // not linear boost multipliers. Encode them directly, no extra log2 here.
  const headroomMin = floatToUnsignedFraction(m.hdrCapacityMin);
  const headroomMax = floatToUnsignedFraction(m.hdrCapacityMax);
  const gainMin = floatToSignedFraction(m.gainMapMin);
  const gainMax = floatToSignedFraction(m.gainMapMax);
  const gamma = floatToUnsignedFraction(m.gamma);
  const offSdr = floatToSignedFraction(m.offsetSdr);
  const offHdr = floatToSignedFraction(m.offsetHdr);

  for (const f of [headroomMin, headroomMax, gainMin, gainMax, gamma, offSdr, offHdr]) {
    if (!f) throw new Error('could not represent gain-map metadata value as a rational fraction');
  }

  const header = concatBytes([u16be(0), u16be(0), new Uint8Array([FLAGS_USE_BASE_COLOR_SPACE])]);
  const frac = (numDenom, signed) => {
    const [n, d] = numDenom;
    return concatBytes([signed ? i32be(n) : u32be(n), u32be(d)]);
  };
  const payload = concatBytes([
    header,
    frac(headroomMin, false),
    frac(headroomMax, false),
    frac(gainMin, true),
    frac(gainMax, true),
    frac(gamma, false),
    frac(offSdr, true),
    frac(offHdr, true),
  ]);
  return appSegment(0xe2, ISO_IDENT, payload);
}

// ---------------------------------------------------------------------------
// MPF (CIPA Multi-Picture Format) segment
// ---------------------------------------------------------------------------

// Builds the fixed 88-byte-body MPF APP2 segment. `gainMapOffset` is the
// gain-map SOI's absolute file offset minus (this segment's FF E2 marker
// offset + 8) -- verified against the reference file's exact bytes.
function buildMpfSegment(primaryTotalBytes, gainMapTotalBytes, gainMapOffset) {
  const tiff = concatBytes([
    strBytes('MM'), // big-endian
    new Uint8Array([0x00, 0x2a]), // TIFF magic
    u32be(8), // offset to first IFD
    u16be(3), // 3 IFD entries
    // MPFVersion (tag 0xB000, type UNDEFINED(7), count 4, value "0100")
    new Uint8Array([0xb0, 0x00]),
    new Uint8Array([0x00, 0x07]),
    u32be(4),
    strBytes('0100'),
    // NumberOfImages (tag 0xB001, type LONG(4), count 1, value 2)
    new Uint8Array([0xb0, 0x01]),
    new Uint8Array([0x00, 0x04]),
    u32be(1),
    u32be(2),
    // MPEntry (tag 0xB002, type UNDEFINED(7), count 32, value_offset 0x32)
    new Uint8Array([0xb0, 0x02]),
    new Uint8Array([0x00, 0x07]),
    u32be(32),
    u32be(0x32),
    // next IFD offset
    u32be(0),
    // MP Entry 1: primary image
    u32be(0x00030000), // attribute: representative image, baseline MP primary
    u32be(primaryTotalBytes),
    u32be(0), // offset 0 == this file
    u16be(0),
    u16be(0),
    // MP Entry 2: gain map image
    u32be(0),
    u32be(gainMapTotalBytes),
    u32be(gainMapOffset),
    u16be(0),
    u16be(0),
  ]);
  return appSegment(0xe2, strBytes('MPF\0'), tiff);
}

// ---------------------------------------------------------------------------
// Minimal JPEG segment scanner, used only to find insertion points in
// canvas-encoded JPEGs (always: SOI, [APP0], tables/frame, SOS...EOI).
// ---------------------------------------------------------------------------

function jpegAfterSoi(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG (missing SOI)');
  return 2;
}

function jpegEndOfFirstApp0(bytes) {
  let i = jpegAfterSoi(bytes);
  if (bytes[i] === 0xff && bytes[i + 1] === 0xe0) {
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    return i + 2 + len;
  }
  return i;
}

function jpegSosStart(bytes) {
  let i = jpegAfterSoi(bytes);
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xda) return i;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  throw new Error('SOS marker not found');
}

function jpegEoiEnd(bytes) {
  const end = bytes.length;
  if (bytes[end - 2] !== 0xff || bytes[end - 1] !== 0xd9) {
    throw new Error('JPEG does not end with EOI');
  }
  return end;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the gain-map image: SOI, our XMP+ISO metadata, then the original
 * greyscale JPEG's own APP0/tables/scan data unchanged, EOI.
 * `grayscaleJpegBytes` must be a plain baseline JPEG (e.g. from
 * OffscreenCanvas.convertToBlob on a greyscale ImageData).
 */
export function buildGainMapJpeg(grayscaleJpegBytes, metadata) {
  const bytes = grayscaleJpegBytes;
  const soi = bytes.slice(0, jpegAfterSoi(bytes));
  const rest = bytes.slice(jpegAfterSoi(bytes), jpegEoiEnd(bytes));

  const xmp = appSegment(0xe1, XMP_IDENT, strBytes(buildGainMapXmpXml(metadata)));
  const iso91 = buildIso91Segment(metadata);

  return concatBytes([soi, xmp, iso91, rest]);
}

/**
 * Builds the final Ultra HDR container: the SDR base JPEG with our XMP/ICC/
 * ISO/MPF segments inserted, followed directly by the gain-map JPEG.
 * `sdrJpegBytes` must be a plain baseline JPEG (from OffscreenCanvas).
 * `gainMapJpegBytes` must already be a complete gain-map JPEG (the output
 * of buildGainMapJpeg).
 */
export function buildUltraHdrJpeg(sdrJpegBytes, gainMapJpegBytes, metadata) {
  const afterApp0 = jpegEndOfFirstApp0(sdrJpegBytes);
  const sosStart = jpegSosStart(sdrJpegBytes);
  const eoiEnd = jpegEoiEnd(sdrJpegBytes);

  const head = sdrJpegBytes.slice(0, afterApp0); // SOI [+ original APP0]
  const middle = sdrJpegBytes.slice(afterApp0, sosStart); // DQT/SOF/DHT, opaque
  const tail = sdrJpegBytes.slice(sosStart, eoiEnd); // SOS scan data...EOI

  const xmp = appSegment(0xe1, XMP_IDENT, strBytes(buildPrimaryXmpXml(gainMapJpegBytes.length)));
  const icc = appSegment(0xe2, strBytes('ICC_PROFILE\0\x01\x01'), base64ToBytes(SRGB_ICC_BASE64));
  const iso34 = buildIso34Segment();

  const preMpf = concatBytes([head, xmp, icc, iso34, middle]);
  const mpfMarkerPos = preMpf.length; // file offset of this segment's 0xFF E2 marker
  const mpfTotalBytes = 2 + 2 + 4 + 84; // marker(2) + len(2) + "MPF\0"(4) + TIFF body(84)
  const primaryTotalBytes = preMpf.length + mpfTotalBytes + tail.length;
  const gainMapSoiAbsolute = primaryTotalBytes; // gain map starts right after primary EOI

  const mpf = buildMpfSegment(
    primaryTotalBytes,
    gainMapJpegBytes.length,
    gainMapSoiAbsolute - (mpfMarkerPos + 8)
  );

  const primary = concatBytes([preMpf, mpf, tail]);
  return concatBytes([primary, gainMapJpegBytes]);
}

export const _internal = {
  floatToUnsignedFractionImpl,
  floatToSignedFraction,
  floatToUnsignedFraction,
  formatG,
  buildPrimaryXmpXml,
  buildGainMapXmpXml,
  buildIso34Segment,
  buildIso91Segment,
  buildMpfSegment,
  appSegment,
  u32be,
  i32be,
  concatBytes,
};
