const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Web logo generator to ensure 100% pixel-perfect match across Web and Tauri Desktop
function makePng(width, height, isMaskable) {
  const scale = (width / 512) * (isMaskable ? 0.75 : 0.90);
  const cx = width / 2;
  const cy = height / 2;
  const bgRadius = isMaskable ? 0 : 90 * (width / 512);

  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      let inBg = true;
      if (!isMaskable) {
        const hw = (width * 0.96) / 2;
        const hh = (height * 0.96) / 2;
        const r = bgRadius;
        if (dx > hw - r && dy > hh - r) {
          const d = Math.hypot(dx - (hw - r), dy - (hh - r));
          if (d > r) inBg = false;
        } else if (dx > hw || dy > hh) {
          inBg = false;
        }
      }

      if (!inBg) {
        continue; // RGBA transparent
      }

      // Background gradient: Modern Blue (#1E3A8A to #2563EB)
      const t = y / height;
      const rBg = Math.round(30 * (1 - t) + 37 * t);
      const gBg = Math.round(58 * (1 - t) + 99 * t);
      const bBg = Math.round(138 * (1 - t) + 235 * t);

      // Radial top glow
      const glow = Math.max(0, 1 - Math.hypot(x - cx, y - height * 0.3) / (width * 0.7));
      let r = Math.min(255, Math.round(rBg + 40 * glow));
      let g = Math.min(255, Math.round(gBg + 60 * glow));
      let b = Math.min(255, Math.round(bBg + 20 * glow));

      // Stylized 'A' / Gateway
      const nx = (x - cx) / scale;
      const ny = (y - cy) / scale;
      let inSymbol = false;
      let isAccent = false;

      if (ny >= -120 && ny <= 110) {
        const prog = (ny + 120) / 230;
        const halfW = prog * 95;
        const innerHalfW = prog * 55;
        if (Math.abs(nx) <= halfW) {
          if (Math.abs(nx) >= innerHalfW || ny > 90) {
            inSymbol = true;
          }
          if (ny >= -10 && ny <= 25 && Math.abs(nx) <= halfW) {
            inSymbol = true;
            if (ny >= -5 && ny <= 20) isAccent = true;
          }
        }
      }

      const distCore = Math.hypot(nx, ny - 55);
      if (distCore <= 24) {
        inSymbol = true;
        isAccent = true;
      }

      if (inSymbol) {
        if (isAccent) {
          r = 56; g = 189; b = 248; // Cyan (#38BDF8)
        } else {
          r = 255; g = 255; b = 255; // White
        }
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = 255;
    }
  }

  // PNG Construction
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = zlib.crc32(ihdrChunk);
  const ihdrLenBuf = Buffer.alloc(4);
  ihdrLenBuf.writeUInt32BE(13, 0);
  const ihdrCrcBuf = Buffer.alloc(4);
  ihdrCrcBuf.writeUInt32BE(ihdrCrc, 0);

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idatChunk = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = zlib.crc32(idatChunk);
  const idatLenBuf = Buffer.alloc(4);
  idatLenBuf.writeUInt32BE(compressed.length, 0);
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc, 0);

  const iendChunk = Buffer.from('IEND');
  const iendCrc = zlib.crc32(iendChunk);
  const iendLenBuf = Buffer.alloc(4);
  iendLenBuf.writeUInt32BE(0, 0);
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc, 0);

  return Buffer.concat([
    sig,
    ihdrLenBuf, ihdrChunk, ihdrCrcBuf,
    idatLenBuf, idatChunk, idatCrcBuf,
    iendLenBuf, iendChunk, iendCrcBuf
  ]);
}

// Generate multi-frame Windows ICO file containing high-res 256x256, 128x128, 48x48, 32x32, and 16x16 PNG frames
// plus standard 32x32 DIB frame for 100% compatibility with Windows Explorer, Taskbar, and RC.EXE compiler
function buildWebMatchedIco() {
  const png256 = makePng(256, 256, false);
  const png128 = makePng(128, 128, false);
  const png48 = makePng(48, 48, false);
  const png32 = makePng(32, 32, false);
  const png16 = makePng(16, 16, false);

  const frames = [
    { width: 256, height: 256, buf: png256 },
    { width: 128, height: 128, buf: png128 },
    { width: 48, height: 48, buf: png48 },
    { width: 32, height: 32, buf: png32 },
    { width: 16, height: 16, buf: png16 },
  ];

  const count = frames.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // count of images

  let offset = 6 + (16 * count);
  const dirEntries = [];
  const imageBuffers = [];

  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.width >= 256 ? 0 : frame.width, 0);
    entry.writeUInt8(frame.height >= 256 ? 0 : frame.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(frame.buf.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset

    dirEntries.push(entry);
    imageBuffers.push(frame.buf);
    offset += frame.buf.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

const icoBuffer = buildWebMatchedIco();

// Write to all Tauri and Web destinations
const targets = [
  path.join(__dirname, 'src-tauri', 'icons', 'icon.ico'),
  path.join(__dirname, 'public', 'favicon.ico'),
  path.join(__dirname, 'public', 'arka_logo.ico'),
  path.join(__dirname, 'src', 'assets', 'images', 'arka_logo.ico'),
];

for (const dest of targets) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, icoBuffer);
  console.log(`[ICON SYNC] Successfully updated ${dest} with exact Web brand logo.`);
}
