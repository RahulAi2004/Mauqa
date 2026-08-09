// Generates PNG app icons (192/512 + maskable) with zero dependencies —
// draws the orange rounded square + white "M" mark pixel-by-pixel and encodes
// the PNG by hand (zlib deflate + CRC32). Run: node tools/gen-icons.js

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });

// ---------- PNG encoding ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- drawing ----------
const ORANGE = [0xf5, 0x9e, 0x0b], WHITE = [0xff, 0xff, 0xff];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.22;
  // "M" polyline in unit space; maskable keeps the mark inside the 80% safe zone
  const inset = maskable ? 0.12 : 0;
  const scale = 1 - inset * 2;
  const pts = [[0.24, 0.74], [0.24, 0.30], [0.50, 0.55], [0.76, 0.30], [0.76, 0.74]]
    .map(([x, y]) => [(inset + x * scale) * size, (inset + y * scale) * size]);
  const stroke = size * 0.095 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect coverage
      const cx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const cy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const outside = Math.hypot(cx, cy) - radius; // >0 means outside the corner arc
      let alpha = 255;
      if (outside > 0.5) alpha = 0;
      else if (outside > -0.5) alpha = Math.round(255 * (0.5 - outside));
      if (alpha === 0) continue;

      // white "M" with 1px anti-aliased edge
      let d = Infinity;
      for (let s = 0; s < pts.length - 1; s++) {
        d = Math.min(d, distToSegment(x + 0.5, y + 0.5, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]));
      }
      const edge = d - stroke / 2;
      let mix = 0;
      if (edge <= -0.5) mix = 1;
      else if (edge < 0.5) mix = 0.5 - edge;

      rgba[i] = Math.round(ORANGE[0] + (WHITE[0] - ORANGE[0]) * mix);
      rgba[i + 1] = Math.round(ORANGE[1] + (WHITE[1] - ORANGE[1]) * mix);
      rgba[i + 2] = Math.round(ORANGE[2] + (WHITE[2] - ORANGE[2]) * mix);
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(size, size, rgba);
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
]) {
  writeFileSync(path.join(outDir, name), drawIcon(size, opts));
  console.log('wrote public/' + name);
}
