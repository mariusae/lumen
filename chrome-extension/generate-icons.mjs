/**
 * Generates simple PNG icons for the Chrome extension.
 * Uses raw PNG encoding (no dependencies) to create a colored square with an "L".
 *
 * Run: node generate-icons.mjs
 */
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

// Minimal uncompressed PNG encoder
function createPng(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const ihdrChunk = makeChunk("IHDR", ihdr)

  // IDAT chunk (uncompressed deflate)
  // Each row: filter byte (0) + RGB pixels
  const rawRows = []
  for (let y = 0; y < height; y++) {
    rawRows.push(0) // no filter
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3
      rawRows.push(pixels[idx], pixels[idx + 1], pixels[idx + 2])
    }
  }
  const rawData = Buffer.from(rawRows)

  // Wrap in zlib (store/no compression)
  const zlibData = zlibStore(rawData)
  const idatChunk = makeChunk("IDAT", zlibData)

  // IEND
  const iendChunk = makeChunk("IEND", Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, "ascii")
  const crcData = Buffer.concat([typeBuffer, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcData) >>> 0, 0)
  return Buffer.concat([len, typeBuffer, data, crc])
}

function zlibStore(data) {
  // zlib header (no compression)
  const header = Buffer.from([0x78, 0x01])

  // Split into blocks of max 65535 bytes
  const blocks = []
  let offset = 0
  while (offset < data.length) {
    const remaining = data.length - offset
    const blockSize = Math.min(remaining, 65535)
    const isLast = offset + blockSize >= data.length

    const blockHeader = Buffer.alloc(5)
    blockHeader[0] = isLast ? 0x01 : 0x00
    blockHeader.writeUInt16LE(blockSize, 1)
    blockHeader.writeUInt16LE(blockSize ^ 0xffff, 3)

    blocks.push(blockHeader)
    blocks.push(data.subarray(offset, offset + blockSize))
    offset += blockSize
  }

  // Adler-32 checksum
  const adler = adler32(data)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(adler >>> 0, 0)

  return Buffer.concat([header, ...blocks, checksum])
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return crc ^ 0xffffffff
}

function adler32(buf) {
  let a = 1
  let b = 0
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521
    b = (b + a) % 65521
  }
  return (b << 16) | a
}

// Draw icon: dark blue background with white "L"
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 3)

  // Background: #1a1a2e
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = 0x1a
    pixels[i * 3 + 1] = 0x1a
    pixels[i * 3 + 2] = 0x2e
  }

  // Draw rounded rectangle border (accent color #4a9eff)
  const pad = Math.max(1, Math.floor(size * 0.1))
  const thick = Math.max(1, Math.floor(size * 0.08))

  for (let y = pad; y < size - pad; y++) {
    for (let x = pad; x < size - pad; x++) {
      const onBorder =
        y < pad + thick ||
        y >= size - pad - thick ||
        x < pad + thick ||
        x >= size - pad - thick
      if (onBorder) {
        const idx = (y * size + x) * 3
        pixels[idx] = 0x4a
        pixels[idx + 1] = 0x9e
        pixels[idx + 2] = 0xff
      }
    }
  }

  // Draw "L" in white
  const lPad = Math.floor(size * 0.28)
  const lThick = Math.max(1, Math.floor(size * 0.15))
  const lBottom = size - lPad
  const lRight = size - lPad

  for (let y = lPad; y < lBottom; y++) {
    for (let x = lPad; x < lPad + lThick; x++) {
      const idx = (y * size + x) * 3
      pixels[idx] = 255
      pixels[idx + 1] = 255
      pixels[idx + 2] = 255
    }
  }
  for (let y = lBottom - lThick; y < lBottom; y++) {
    for (let x = lPad; x < lRight; x++) {
      const idx = (y * size + x) * 3
      pixels[idx] = 255
      pixels[idx + 1] = 255
      pixels[idx + 2] = 255
    }
  }

  return createPng(size, size, pixels)
}

// Generate icons
const iconsDir = join(import.meta.dirname, "icons")
mkdirSync(iconsDir, { recursive: true })

for (const size of [16, 48, 128]) {
  const png = drawIcon(size)
  writeFileSync(join(iconsDir, `icon${size}.png`), png)
  console.log(`Generated icon${size}.png`)
}

console.log("Done!")
