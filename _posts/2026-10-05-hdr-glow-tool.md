---
layout: post
title: "HDR Glow: A Browser Tool That Makes Your Instagram Photos Glow on HDR Screens"
date: 2026-10-05 10:00:00 +0530
tags: [hdr, photography, javascript, hobby-project, how-to]
excerpt: "A static, client-side tool that turns an edited photo into an Ultra HDR gain-map JPEG — the kind that glows on an HDR Mac in Chrome or in the Instagram app, and looks like a normal photo everywhere else. No server, no upload, no build step."
---

I edit photos in Affinity, export a JPEG, and post it. That JPEG looks fine everywhere,
but it never does the thing I actually see on my own HDR screen while editing: skies that
glow, highlights that have real headroom above white. Instagram and modern phones can show
that glow — it's called an **Ultra HDR gain-map JPEG** — but nothing in my normal export
workflow produces one.

So I built [**HDR Glow**](/hdr-tool/): a small, static page that takes a normal edited
photo and writes a gain-map JPEG next to it. Same pixels on a normal screen. A visible glow
on an HDR one.

## What It Actually Does

A gain-map JPEG is two images stapled into one file: the normal photo you already have, and
a small greyscale "gain map" that says, per pixel, how much brighter this should look on a
screen that can show it. A phone or browser that understands the format reads both and
renders the glow. Everything else just sees the normal photo, because that's all it knows
how to read.

The tool:

1. Takes your edited photo (JPEG or PNG).
2. Optionally takes a 32-bit OpenEXR export of the same edit, if you have highlight data
   above white to work with.
3. If you don't have one — which is the common case — it synthesizes the headroom itself:
   finding sky and bright highlights by luminance, and small near-white light sources
   (headlights, lamps, the sun) separately, so you can dial in how much each glows.
4. Writes the two-image container by hand, byte for byte, matching the format Google's
   `libultrahdr` produces, so it's read correctly by Chrome, Instagram, and HDR phones.

## No Server, Because There Isn't One

This whole site is static — GitHub Pages — so the tool had to be too. There's no upload,
no backend, no build step. Everything runs in the browser: decoding, the gain-map math,
JPEG encoding, and assembling the final file, all in a Web Worker so a full-size photo
doesn't freeze the tab. Your photos never leave the tab they're open in.

The one part I couldn't shortcut was the file format itself. Ultra HDR's container is a
JPEG with a second JPEG appended after it, held together by XMP metadata, an embedded ICC
profile, and a CIPA Multi-Picture Format block whose byte offsets have to point at exactly
the right place or nothing reads it. Getting that right meant parsing a known-good
reference file byte by byte and checking my output against it, segment by segment, rather
than trusting that it "looked about right."

## Try It

[**/hdr-tool/**](/hdr-tool/) &mdash; drop in a photo, adjust the sky and highlight sliders,
download. To actually see the glow: AirDrop the file to your phone and post it from the
Instagram app (not WhatsApp — it recompresses images and strips the glow), or open it in
Chrome on an HDR Mac. On a normal screen, it's just your photo.
