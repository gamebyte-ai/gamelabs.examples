// Generates the two particle textures used by the avoidance example:
//   - particle-soft.png  → soft radial falloff, used by the propulsion trail
//   - particle-spark.png → bright core + sharper falloff, used by the explosion
//
// Both are white-with-alpha so the framework's `MeshBasicMaterial.color`
// can re-tint them at runtime (green for propulsion, orange for explosion).
// Pure JS PNG encoder — only Node's zlib + Buffer, no third-party deps.
//
// Run from this directory or the repo root:
//   node examples/avoidance/scripts/generateParticleTextures.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, "..", "assets");
mkdirSync(assetsDir, { recursive: true });

const SIZE = 64;

// ── PNG encoder (same shape as generateSlowIcon.mjs) ───────────────────

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

// ── Particle textures ─────────────────────────────────────────────────

/**
 * Smooth radial gradient. Pure white at the centre, transparent at the
 * edge, with a squared falloff so most of the image is faded — the
 * trail particles look like soft puffs rather than hard discs.
 */
function makeSoft(size = SIZE) {
  const px = new Uint8Array(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxR;
      const t = Math.max(0, 1 - d);
      const a = t * t; // squared = smooth, dim periphery
      const i = (y * size + x) * 4;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return { width: size, height: size, pixels: px };
}

/**
 * Bright core with a sharper falloff. Inner third is fully opaque,
 * outer two-thirds drops off fast. Reads as a glowing ember rather
 * than a diffuse puff — the explosion sells more impact this way.
 */
function makeSpark(size = SIZE) {
  const px = new Uint8Array(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxR;
      let a;
      if (d < 0.25) {
        a = 1;
      } else if (d < 1) {
        const t = (d - 0.25) / 0.75;
        a = (1 - t) * (1 - t) * (1 - t); // cubic falloff for a hot core
      } else {
        a = 0;
      }
      const i = (y * size + x) * 4;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return { width: size, height: size, pixels: px };
}

// ── Run ───────────────────────────────────────────────────────────────

for (const [name, factory] of [
  ["particle-soft.png", makeSoft],
  ["particle-spark.png", makeSpark],
]) {
  const out = resolve(assetsDir, name);
  const img = factory();
  writeFileSync(out, encodePng(img.width, img.height, img.pixels));
  console.log(`wrote ${out} (${img.width}×${img.height})`);
}
