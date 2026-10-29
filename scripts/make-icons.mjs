// Draws the PNG app icons (same design as public/icons/icon.svg) without extra dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function draw(size, maskable) {
  const s = size / 512; const raw = Buffer.alloc(size * (size * 4 + 1));
  const lines = [[150, 130, 150, 340], [250, 130, 250, 340], [370, 130, 262, 236], [290, 232, 378, 340]];
  const pad = maskable ? 0.12 : 0; // keep the glyph inside the maskable safe zone
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = x / s, v = y / s;
      const gx = (u - 256) / (1 - 2 * pad) + 256, gy = (v - 256) / (1 - 2 * pad) + 256;
      const r = 96, inside = maskable || (Math.max(0, Math.abs(u - 256) - (256 - r)) ** 2 + Math.max(0, Math.abs(v - 256) - (256 - r)) ** 2 <= r * r);
      let col = inside ? [0x1e, 0x3a, 0x5f, 255] : [0, 0, 0, 0];
      if (inside && lines.some((l) => segDist(gx, gy, ...l) <= 26)) col = [255, 255, 255, 255];
      if (inside && gx >= 120 && gx <= 392 && gy >= 390 && gy <= 416) col = [0x2b, 0xb5, 0xa4, 255];
      raw.set(col, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync('public/icons/icon-192.png', draw(192, false));
writeFileSync('public/icons/icon-512.png', draw(512, false));
writeFileSync('public/icons/maskable-512.png', draw(512, true));
console.log('icons written');
