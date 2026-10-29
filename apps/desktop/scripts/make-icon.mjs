// Draws Jig's app icon (build/icon.png, 1024×1024) without any image tooling: Jig's logo — an amber
// L-shaped fence holding a square piece in its corner, like a corner jig — on a graphite rounded square.
// The shapes are the same as `renderer/ui/JigLogo.tsx` (one 1024 grid). electron-builder makes the
// .icns from it; this script also writes the Windows .ico. Run: node scripts/make-icon.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { appDir } from "./build-config.mjs";

function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const graphite = [0x1e, 0x1f, 0x22]; // Jig Dark canvas
  const amber = [0xe0, 0xa4, 0x58]; // Jig Dark accent

  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const inDisc = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  /** A rectangle with its own radius per corner: top-left, top-right, bottom-right, bottom-left. */
  function inRoundRect(x, y, x0, y0, x1, y1, [tl, tr, br, bl]) {
    if (!inRect(x, y, x0, y0, x1, y1)) return false;
    for (const [r, cx, cy, left, top] of [
      [tl, x0 + tl, y0 + tl, true, true],
      [tr, x1 - tr, y0 + tr, false, true],
      [br, x1 - br, y1 - br, false, false],
      [bl, x0 + bl, y1 - bl, true, false],
    ])
      if (r && (left ? x < cx : x > cx) && (top ? y < cy : y > cy) && !inDisc(x, y, cx, cy, r)) return false;
    return true;
  }

  // The logo on a 1024 grid (JigLogo.tsx uses the same numbers).
  const square = (x, y) => inRoundRect(x, y, 32, 32, 992, 992, [216, 216, 216, 216]);
  // The fence: a vertical and a horizontal arm meeting in a square inner corner.
  const fence = (x, y) =>
    inRoundRect(x, y, 260, 252, 400, 772, [24, 24, 0, 24]) ||
    inRoundRect(x, y, 260, 624, 772, 772, [0, 24, 24, 24]);
  // The piece, held in the fence's corner with an even gap.
  const piece = (x, y) => inRoundRect(x, y, 440, 292, 732, 584, [24, 24, 24, 24]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 4×4 supersampling for smooth edges.
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const fx = ((x + (sx + 0.5) / 4) * 1024) / size;
          const fy = ((y + (sy + 0.5) / 4) * 1024) / size;
          if (!square(fx, fy)) continue;
          bg++;
          if (fence(fx, fy) || piece(fx, fy)) fg++;
        }
      const i = (y * size + x) * 4;
      const f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(graphite[c] * (1 - f) + amber[c] * f);
      px[i + 3] = Math.round((bg / 16) * 255);
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
  return png;
}

writeFileSync(join(appDir, "build", "icon.png"), renderIcon(1024));
const png = renderIcon(256);
// A PNG-compressed 256px ICO entry is understood by Windows Vista and later.
// The same artwork is kept at full resolution in the PNG.
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync(join(appDir, "build", "icon.ico"), Buffer.concat([icoHeader, png]));
console.log("Wrote build/icon.png and build/icon.ico");
