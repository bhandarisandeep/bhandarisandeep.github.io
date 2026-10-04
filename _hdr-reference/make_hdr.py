"""Make an Ultra HDR (gain-map) JPEG from an Affinity export.

SDR base  = the Affinity JPEG (what normal screens show).
HDR intent = the linear EXR, with highlights lifted above SDR white
             (only if the EXR itself has no >1.0 values).
The gain map (log2 HDR/SDR) + metadata is written by Google's libultrahdr,
following Adobe's gain-map spec (hdrgm XMP + MPF) and ISO 21496-1.
"""
import sys, subprocess, numpy as np, OpenEXR, cv2
from PIL import Image

EXR, JPG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
WIDTH = int(sys.argv[4]) if len(sys.argv) > 4 else 0   # 0 = full size
SKY_BOOST, LIGHT_BOOST = 2.6, 6.0                      # linear multipliers
APP = "/home/claude/libultrahdr/build/ultrahdr_app"

hdr = OpenEXR.File(EXR).channels()["RGBA"].pixels[..., :3].astype(np.float32)
sdr = Image.open(JPG).convert("RGB")
if WIDTH:
    h = round(sdr.height * WIDTH / sdr.width)
    sdr = sdr.resize((WIDTH, h), Image.LANCZOS)
    hdr = cv2.resize(hdr, (WIDTH, h), interpolation=cv2.INTER_AREA)
H, W = hdr.shape[:2]

if hdr.max() <= 1.001:
    # EXR is clipped (identical to the JPEG) -> use the JPEG itself, linearised,
    # so SDR and HDR match exactly and the gain map is only our highlight lift.
    s8 = np.asarray(sdr).astype(np.float32) / 255
    hdr = np.where(s8 <= 0.04045, s8 / 12.92, ((s8 + 0.055) / 1.055) ** 2.4).astype(np.float32)  # clipped EXR -> synthesise highlight headroom
    lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    k = max(3, W // 400) | 1
    soft = cv2.GaussianBlur(lum, (0, 0), k)             # smooth mask, no noise
    def ramp(x, a, b):
        t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
    sky = ramp(soft, 0.45, 0.85)                        # bright sky/clouds
    lights = ramp(lum, 0.97, 1.0) * ramp(soft, 0.6, 0.9)  # near-white specular
    boost = 1 + (SKY_BOOST - 1) * sky
    boost = np.maximum(boost, 1 + (LIGHT_BOOST - 1) * lights)
    hdr = hdr * boost[..., None]
    print(f"synthesised headroom: max boost {boost.max():.2f}x "
          f"({np.log2(boost.max()):.2f} stops), {100*(boost>1.2).mean():.1f}% of pixels lifted")

sdr_path = OUT + ".sdr.jpg"
sdr.save(sdr_path, quality=95, subsampling=0,
         icc_profile=Image.open(JPG).info.get("icc_profile"))
rgba = np.concatenate([hdr, np.ones((H, W, 1), np.float32)], -1).astype(np.float16)
raw = OUT + ".hdr.raw"; rgba.tofile(raw)

cmd = [APP, "-m", "0", "-p", raw, "-i", sdr_path, "-w", str(W), "-h", str(H),
       "-a", "4", "-t", "0", "-C", "0", "-c", "0",
       "-q", "95", "-Q", "90", "-s", "2", "-M", "0", "-k", "1", "-K", str(LIGHT_BOOST), "-L", str(round(LIGHT_BOOST*203)), "-z", OUT]
print(subprocess.run(cmd, capture_output=True, text=True).stdout[-400:])
