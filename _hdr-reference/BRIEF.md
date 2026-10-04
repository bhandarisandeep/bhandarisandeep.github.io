# Brief: "HDR Glow" web tool for bhandarisandeep.com

You are working inside the Jekyll repo that publishes **bhandarisandeep.com** on GitHub Pages
(Jekyll 3.10, GitHub Pages build — no custom plugins, no build step we control).
Build a **browser-only** tool at `/hdr-tool/` that turns a normal edited photo into an
**HDR gain-map JPEG** (Ultra HDR) that glows on HDR screens (Chrome on HDR Macs, iPhone/Android
HDR phones, Instagram app uploads) and looks exactly like the original everywhere else.

This folder (`_hdr-reference/`) is excluded from the Jekyll build because it starts with `_`. It contains:

| File | What it is |
|---|---|
| `BRIEF.md` | this document |
| `make_hdr.py` | the working Python prototype (uses Google libultrahdr to write the file) |
| `test_input_1080.jpg` | an input photo (1080×1350, sRGB) to test with |
| `reference_HDR_instagram.jpg` | a **known-good** output made by the prototype from the same photo — it glows in Chrome on an M2 Pro MacBook. Use it as the byte-layout reference. |

---

## 1. Hard constraints

- **Static files only.** Plain HTML + CSS + vanilla JS (ES modules OK). No npm build, no bundler,
  no server, no external CDN at runtime. Anything third-party must be vendored into the repo
  (prefer writing it ourselves; it's small).
- **Photos never leave the browser.** No uploads, no analytics on the images. Say this on the page.
- Must handle a full-size camera export (~4000×5000) without freezing the tab: do heavy work in a
  **Web Worker** with `OffscreenCanvas`, show progress.
- Must work in current Chrome, Safari and Firefox (output viewing glow only matters in Chrome/iOS).
- Match the existing blog look: inspect the repo's `_layouts/`, `_includes/`, `_config.yml`, and
  theme first. Use the site's normal layout via front matter if it renders a full-width page
  well; otherwise make a standalone page that borrows the site's fonts/colours and links back home.

## 2. User flow (UI)

1. Drop zone 1 (**required**): the edited photo — JPEG or PNG (sRGB). This is the "SDR base".
2. Drop zone 2 (**optional**): a 32-bit **OpenEXR** export of the *same* edit from Affinity.
   Only used if it really contains HDR data (any pixel > 1.0). If its max ≤ 1.0, or its size
   differs from the JPEG, ignore it and show a friendly note ("Your EXR has no extra highlight
   data, so the glow is created from your photo").
3. Controls (with sensible defaults, live re-render of a small preview):
   - **Sky / highlight glow**: 1.0×–4.0×, default **2.6×**
   - **Light sources glow** (headlights, sun, lamps): 1.0×–8.0×, default **6.0×**
4. Buttons: **Download for Instagram** and **Download full size**.
   - Instagram version: width **1080**, height by aspect ratio (a 4:5 photo → 1080×1350).
   - Full size: original resolution.
   - File names: `<original-name>_HDR_instagram.jpg`, `<original-name>_HDR_full.jpg`.
5. Show the result in an `<img>` (blob URL) so Chrome on an HDR screen shows the glow, and a
   small "glow map" preview (black = unchanged, bright = boosted), like `make_hdr.py` made.
6. Short help text: how to post (AirDrop/Files to phone → upload in the Instagram app, don't send
   through WhatsApp), that only HDR screens show the glow, and that the Mac's Preview app needs
   macOS 15+ (Chrome always works).

## 3. The image maths (port of `make_hdr.py`)

All maths in **linear light**, sRGB/BT.709 primaries.

1. Decode the base JPEG to 8-bit RGB (`createImageBitmap` → OffscreenCanvas → `getImageData`).
   Use `colorSpaceConversion: "none"`-free default; assume sRGB.
2. `sdrLin = srgbToLinear(rgb/255)` (exact sRGB EOTF: `c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`).
3. If a valid EXR with values > 1.0 is given → `hdrLin = exr RGB` (linear float), skip step 4.
4. Otherwise synthesise the HDR rendition:
   - `lum = 0.2126R + 0.7152G + 0.0722B` (of `sdrLin`)
   - `soft = gaussianBlur(lum, sigma = max(3, W/400))` — a separable/box-approx blur is fine,
     and it can be computed at reduced resolution then bilinear-upsampled.
   - `ramp(x,a,b) = smoothstep`: `t = clamp((x-a)/(b-a),0,1); t*t*(3-2t)`
   - `sky = ramp(soft, 0.45, 0.85)`
   - `lights = ramp(lum, 0.97, 1.0) * ramp(soft, 0.6, 0.9)`
   - `boost = max(1 + (SKY-1)*sky, 1 + (LIGHT-1)*lights)` (SKY, LIGHT = slider values)
   - `hdrLin = sdrLin * boost`
5. Gain map (single channel / luminance, **half resolution** in each dimension):
   - per gain-map pixel: `g = log2((hdrY + kHDR) / (sdrY + kSDR))` using luminance of the
     downsampled renditions, `kSDR = kHDR = 1e-7` (as reference) — or 1/64 if you prefer, but
     write the same values into the metadata.
   - `minLog = 0` (never darken), `maxLog = log2(max(SKY, LIGHT))` (or measured max when using EXR)
   - normalise: `n = clamp((g - minLog)/(maxLog - minLog), 0, 1)`, gamma = 1,
     store `round(n*255)` as an 8-bit greyscale image (R=G=B is fine).
6. Encode the base (SDR) JPEG at quality ~0.95 and the gain map JPEG at ~0.90 using
   `OffscreenCanvas.convertToBlob({type:"image/jpeg"})`. For the full-size version you may
   instead **reuse the user's original JPEG bytes** as the base (no re-compression), as long as
   the gain map is computed from the same decoded pixels. Keep / insert the sRGB ICC profile.
7. Metadata values (for both XMP and ISO):
   `GainMapMin=0, GainMapMax=maxLog, Gamma=1, OffsetSDR=kSDR, OffsetHDR=kHDR,
   HDRCapacityMin=0, HDRCapacityMax=maxLog, BaseRenditionIsHDR=False`.
   (HDRCapacityMax must equal maxLog — a bigger value makes phones show only part of the glow.)

## 4. The file container (most important part — copy the reference exactly)

Write a pure-JS JPEG segment writer. Byte layout of `reference_HDR_instagram.jpg`
(verify by parsing it yourself):

**Primary image** (= SDR base JPEG with extra segments inserted after SOI/APP0):
1. `SOI`, `APP0 JFIF`
2. `APP1` XMP (`http://ns.adobe.com/xap/1.0/\0` + packet) — contains
   `hdrgm:Version="1.0"` **and** the Google container directory:
   ```xml
   <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.2">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
     <rdf:Description xmlns:Container="http://ns.google.com/photos/1.0/container/"
        xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
        xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0">
      <Container:Directory><rdf:Seq>
        <rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li>
        <rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" Item:Mime="image/jpeg" Item:Length="{GAINMAP_JPEG_BYTES}"/></rdf:li>
      </rdf:Seq></Container:Directory>
     </rdf:Description>
    </rdf:RDF>
   </x:xmpmeta>
   ```
3. `APP2 ICC_PROFILE` (sRGB)
4. `APP2` ISO 21496-1 version marker: `urn:iso:std:iso:ts:21496:-1\0` followed by 4 bytes
   `00 00 00 00` (min version 0, writer version 0) — 34-byte segment in reference.
5. `APP2 MPF` (CIPA Multi-Picture Format): big-endian TIFF header, 3 tags
   (`B000` MPFVersion "0100", `B001` NumberOfImages = 2, `B002` MP Entry, 2 × 16 bytes):
   entry 1 = primary (attr `0x00030000`, size = primary total bytes, offset 0);
   entry 2 = gain map (attr 0, size = gain map bytes, **offset relative to the MPF TIFF header
   start** = gain-map SOI position − (MPF APP2 position + 8)). Reference hex of the 88-byte
   segment body:
   `4d5046004d4d002a000000080003b00000070000000430313030b00100040000000100000002b00200070000002000000032000000000003000000057efc0000000000000000000000000000563e0005764d00000000`
   Sizes/offsets depend on the other bytes, so compute them in two passes.
6. The rest of the base JPEG (DQT, SOF, DHT, SOS … `EOI`).

**Gain-map image** appended directly after the primary's `EOI`:
1. `SOI`
2. `APP1` XMP with the metadata as attributes:
   ```xml
   <rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
     hdrgm:Version="1.0" hdrgm:GainMapMin="0" hdrgm:GainMapMax="2.58496" hdrgm:Gamma="1"
     hdrgm:OffsetSDR="1e-07" hdrgm:OffsetHDR="1e-07" hdrgm:HDRCapacityMin="0"
     hdrgm:HDRCapacityMax="2.58496" hdrgm:BaseRenditionIsHDR="False"/>
   ```
3. `APP2` ISO 21496-1 binary metadata (`urn:iso:std:iso:ts:21496:-1\0` + payload).
   Implement the encoder the same way as libultrahdr `lib/src/gainmapmetadata.cpp`
   (`uhdr_gainmap_metadata_frac` / `encodeGainmapMetadata`: version fields, flags, then
   base/alternate HDR headroom and per-channel gain min/max, gamma, base/alternate offsets as
   signed/unsigned 32-bit numerator/denominator fractions, big-endian). Reference payload hex
   for the metadata above (91-byte segment):
   `75726e3a69736f3a7374643a69736f3a74733a32313439363a2d31000000000040000000000000000100a5700700400000000000000000000100a570070040000000000001000000010000004d2de544770000004d2de54477`
   **Unit-test: your encoder must reproduce this exact payload for these values.**
4. the gain-map JPEG body (`APP0`… `EOI`).

## 5. Verification (do all before saying "done")

- Node test script (`_hdr-reference/test.mjs`, run with `node`) that:
  - parses `reference_HDR_instagram.jpg` and prints its segment list,
  - runs the same container writer on fixed inputs and checks: MPF offsets point exactly at the
    gain-map SOI, `Item:Length` equals the gain-map byte length, ISO payload matches the hex above,
    XMP parses as XML.
- In the browser: process `test_input_1080.jpg` with default sliders and compare the
  output's segment list and metadata with the reference (pixel data may differ slightly).
- If `exiftool` is installed, run `exiftool -a -G1 output.jpg` and confirm it sees MPF image 2
  and the hdrgm tags.
- Run the site locally (`bundle exec jekyll serve` if Ruby/bundler exist; otherwise
  `python3 -m http.server` in `_site` or directly in the folder) and open `/hdr-tool/`.
- Ask me (the user) to do the final eye-test: open the downloaded file in **Chrome** on my
  M2 Pro MacBook — the sky must glow like the reference does.

## 6. Repo hygiene

- Files: `hdr-tool/index.html` (+ `hdr-tool/app.js`, `hdr-tool/worker.js`, `hdr-tool/exr.js`,
  `hdr-tool/ultrahdr.js`, `hdr-tool/style.css` — split as you see fit).
- EXR reader: minimal, written by us — scanline images, `NONE`, `ZIP`, `ZIPS` compression
  (zlib → use the browser's `DecompressionStream("deflate")`, then undo the predictor and
  byte interleave), `HALF` and `FLOAT` channels R,G,B(,A). Clear error for other compressions
  (PIZ etc.): "Export EXR with ZIP compression".
- Make sure Jekyll doesn't mangle the JS (files without front matter are copied as-is).
- Optional, **ask me first**: add a link in the site nav and/or a short blog post
  `_posts/YYYY-MM-DD-hdr-glow-tool.md` explaining the tool.
- Work on a new branch `hdr-tool`, commit with clear messages, show me a summary and the local
  URL. **Ask before pushing** to GitHub.
