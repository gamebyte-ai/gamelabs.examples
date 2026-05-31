// Generates the hourglass icon used as the avoidance slow-time
// button's `iconTextureId`. White-with-alpha so the framework can
// re-tint or dim it via the OscVisual's `color` / `alpha`. Pure JS
// PNG encoder — only depends on Node's zlib + Buffer; no third-party
// imaging deps.
//
// Run from this directory or the repo root:
//   node examples/avoidance/scripts/generateSlowIcon.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, "..", "assets");
mkdirSync(assetsDir, { recursive: true });

const SIZE = 256;

// ── PNG encoder ─────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(filtered);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ── Pixel blending ──────────────────────────────────────────────────────

/** Max-blend white-with-alpha: opaque overdraw doesn't darken neighbours. */
function plotWhite(px, size, x, y, cov) {
  if (cov <= 0) return;
  const i = (y * size + x) * 4;
  const a = Math.round(Math.max(0, Math.min(1, cov)) * 255);
  if (a > px[i + 3]) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = a;
  }
}

/**
 * Fills the row `y` with white where `left <= x <= right`, with
 * 1px AA on each end. `yCov` lets the caller dim entire rows for top
 * /bottom edge AA.
 */
function fillRowAA(px, size, y, left, right, yCov) {
  const aa = 1;
  const xMin = Math.max(0, Math.floor(left - aa));
  const xMax = Math.min(size - 1, Math.ceil(right + aa));
  for (let x = xMin; x <= xMax; x++) {
    const cx = x + 0.5;
    let xCov;
    if (cx < left - aa || cx > right + aa) xCov = 0;
    else if (cx < left) xCov = 1 - (left - cx) / aa;
    else if (cx > right) xCov = 1 - (cx - right) / aa;
    else xCov = 1;
    plotWhite(px, size, x, y, xCov * yCov);
  }
}

// ── Hourglass shape ─────────────────────────────────────────────────────

/**
 * Draws an hourglass silhouette: two flat caps at top and bottom and
 * two triangles meeting at a single-pixel waist. Filled white with AA
 * on the slanted edges (row-fill AA) and the cap top/bottom (per-row
 * vertical coverage).
 */
function makeHourglass(size = SIZE) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const halfW = size * 0.21;
  const halfH = size * 0.34;
  const capThick = size * 0.06;
  const triHeight = halfH - capThick;
  const aa = 1;

  for (let y = 0; y < size; y++) {
    const dy = y + 0.5 - cy;
    if (dy < -halfH - aa || dy > halfH + aa) continue;

    // Top/bottom edge anti-aliasing.
    let yCov = 1;
    if (dy > halfH) yCov = (halfH + aa - dy) / aa;
    else if (dy < -halfH) yCov = (dy - (-halfH - aa)) / aa;
    if (yCov <= 0) continue;

    let rowHalfW;
    if (dy <= -halfH + capThick || dy >= halfH - capThick) {
      // Cap region — full width.
      rowHalfW = halfW;
    } else if (dy <= 0) {
      // Upper triangle: full width at the bottom of the cap, zero at waist.
      const t = (-dy) / triHeight;
      rowHalfW = halfW * t;
    } else {
      // Lower triangle.
      const t = dy / triHeight;
      rowHalfW = halfW * t;
    }

    if (rowHalfW <= 0) continue;
    fillRowAA(px, size, y, cx - rowHalfW, cx + rowHalfW, yCov);
  }

  return { width: size, height: size, pixels: px };
}

// ── Run ─────────────────────────────────────────────────────────────────

const out = resolve(assetsDir, "slow-icon.png");
const img = makeHourglass();
writeFileSync(out, encodePng(img.width, img.height, img.pixels));
console.log(`wrote ${out} (${img.width}×${img.height})`);
