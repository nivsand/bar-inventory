// Zero-dependency PNG icon generator (no image libraries needed).
// Draws a brand-colored tile with a white martini-glass mark, supersampled 4x
// for anti-aliasing. Outputs the icon set used by the PWA manifest + iOS.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(OUT, { recursive: true });

// brand-700 = #104edd
const BRAND = [0x10, 0x4e, 0xdd];
const WHITE = [0xff, 0xff, 0xff];

// --- CRC32 ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- geometry helpers (normalized 0..1, y down) ---
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d = (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const s = ((py - cy) * (bx - cx) - (px - cx) * (by - cy)) / d;
  const t = ((py - cy) * (ax - cx) - (px - cx) * (ay - cy)) / d * -1 + 0; // placeholder
  // barycentric proper:
  const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const l3 = 1 - l1 - l2;
  return l1 >= 0 && l2 >= 0 && l3 >= 0;
}
function inRect(px, py, x0, y0, x1, y1) {
  return px >= x0 && px <= x1 && py >= y0 && py <= y1;
}
function inRoundedSquare(px, py, r) {
  // unit square [0,1] with corner radius r
  const cx = Math.min(Math.max(px, r), 1 - r);
  const cy = Math.min(Math.max(py, r), 1 - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r || (px >= r && px <= 1 - r) || (py >= r && py <= 1 - r);
}
// is the white martini mark at this normalized point?
function inMark(px, py) {
  const bowl = inTriangle(px, py, 0.26, 0.30, 0.74, 0.30, 0.5, 0.585);
  const stem = inRect(px, py, 0.475, 0.55, 0.525, 0.78);
  const base = inRect(px, py, 0.34, 0.78, 0.66, 0.83);
  return bowl || stem || base;
}

function render(size, { maskable }) {
  const ss = 4; // supersample
  const rgba = Buffer.alloc(size * size * 4);
  const r = 0.22; // corner radius for non-maskable tile
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rA = 0, gA = 0, bA = 0, aA = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          let col, alpha;
          const insideTile = maskable ? true : inRoundedSquare(nx, ny, r);
          if (!insideTile) { col = [0, 0, 0]; alpha = 0; }
          else if (inMark(nx, ny)) { col = WHITE; alpha = 255; }
          else { col = BRAND; alpha = 255; }
          rA += col[0] * alpha; gA += col[1] * alpha; bA += col[2] * alpha; aA += alpha;
        }
      }
      const n = ss * ss;
      const a = aA / n;
      const idx = (y * size + x) * 4;
      // un-premultiply
      rgba[idx] = a ? Math.round(rA / aA) : 0;
      rgba[idx + 1] = a ? Math.round(gA / aA) : 0;
      rgba[idx + 2] = a ? Math.round(bA / aA) : 0;
      rgba[idx + 3] = Math.round(a);
    }
  }
  return encodePng(size, size, rgba);
}

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true }, // iOS has no transparency/rounding
  { file: "favicon-32.png", size: 32, maskable: false },
];
for (const t of targets) {
  fs.writeFileSync(path.join(OUT, t.file), render(t.size, { maskable: t.maskable }));
  console.log("wrote", t.file);
}
console.log("done");
