// Draws Jig's app icon (build/icon.png, 512×512) without any image tooling: a rounded square in Jig's
// accent colour with a white "J"-shaped jig (a bracket and a bar). electron-builder converts it to .ico
// / .icns. Run: node scripts/make-icon.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { appDir } from "./build-config.mjs";

const size = 512;
const px = Buffer.alloc(size * size * 4);
const accent = [0x4f, 0x8c, 0xff];
const ink = [0xff, 0xff, 0xff];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    // 4× supersampling for smooth edges.
    let bg = 0;
    let fg = 0;
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++) {
        const fx = x + (sx + 0.5) / 4;
        const fy = y + (sy + 0.5) / 4;
        if (!inRoundRect(fx, fy, 24, 24, 488, 488, 104)) continue;
        bg++;
        const stem = inRoundRect(fx, fy, 290, 140, 350, 350, 0);
        const hook =
          inRoundRect(fx, fy, 150, 290, 350, 400, 55) && !inRoundRect(fx, fy, 210, 230, 290, 340, 30);
        const bar = inRoundRect(fx, fy, 170, 112, 400, 168, 28);
        if (stem || hook || bar) fg++;
      }
    const i = (y * size + x) * 4;
    const a = bg / 16;
    const f = bg ? fg / bg : 0;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(accent[c] * (1 - f) + ink[c] * f);
    px[i + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const raw = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(join(appDir, "build", "icon.png"), png);
console.log("Wrote build/icon.png");
