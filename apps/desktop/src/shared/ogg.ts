/**
 * Opus packets in an Ogg file (RFC 7845), the format Telegram plays as a voice message (D-350). The
 * packets come from WebCodecs' Opus encoder at 48 kHz; Chromium has no Ogg writer of its own.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32 (polynomial 0x04C11DB7, not reflected, no final xor). */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]!) >>> 0;
  return crc;
}

function page(
  packets: Uint8Array[],
  granule: bigint,
  serial: number,
  sequence: number,
  flags: number,
): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const size = packets.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + size);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  out[4] = 0;
  out[5] = flags;
  view.setBigUint64(6, granule, true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, at);
    at += p.length;
  }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

const ascii = (text: string) => new TextEncoder().encode(text);

/**
 * An Ogg Opus file from 48 kHz packets: `samples` is the audio's length at 48 kHz (the end's padding
 * is cut off), `preSkip` the encoder's delay.
 */
export function oggOpus(
  packets: Uint8Array[],
  opts: { samples: number; frameSamples?: number; preSkip?: number; serial?: number },
): Uint8Array {
  const frame = opts.frameSamples ?? 960;
  const preSkip = opts.preSkip ?? 312;
  const serial = opts.serial ?? 0x4a1d;
  const head = new Uint8Array(19);
  head.set(ascii("OpusHead"));
  const hv = new DataView(head.buffer);
  head[8] = 1; // version
  head[9] = 1; // mono
  hv.setUint16(10, preSkip, true);
  hv.setUint32(12, 48_000, true);
  hv.setInt16(16, 0, true);
  head[18] = 0; // mapping family
  const vendor = ascii("Jig");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(ascii("OpusTags"));
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);

  const pages = [page([head], 0n, serial, 0, 0x02), page([tags], 0n, serial, 1, 0)];
  const end = BigInt(preSkip + opts.samples);
  let sequence = 2;
  let decoded = 0;
  for (let i = 0; i < packets.length || i === 0; ) {
    const group: Uint8Array[] = [];
    let segments = 0;
    while (i < packets.length) {
      const need = Math.floor(packets[i]!.length / 255) + 1;
      if (segments + need > 255 || group.length >= 50) break;
      group.push(packets[i]!);
      segments += need;
      decoded += frame;
      i++;
    }
    const last = i >= packets.length;
    const granule = last ? end : BigInt(decoded) < end ? BigInt(decoded) : end;
    pages.push(page(group, granule, serial, sequence++, last ? 0x04 : 0));
    if (last) break;
  }
  const out = new Uint8Array(pages.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The pages of an Ogg file (tests, and a check before sending). */
export function oggPages(
  bytes: Uint8Array,
): Array<{ flags: number; granule: bigint; packets: Uint8Array[]; crcOk: boolean }> {
  const pages = [];
  let at = 0;
  while (at + 27 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at);
    const count = bytes[at + 26]!;
    const lacing = bytes.subarray(at + 27, at + 27 + count);
    const size = lacing.reduce((sum, n) => sum + n, 0);
    const whole = bytes.slice(at, at + 27 + count + size);
    const crc = view.getUint32(22, true);
    whole.fill(0, 22, 26);
    const packets: Uint8Array[] = [];
    let start = at + 27 + count;
    let length = 0;
    for (const n of lacing) {
      length += n;
      if (n < 255) {
        packets.push(bytes.slice(start, start + length));
        start += length;
        length = 0;
      }
    }
    pages.push({
      flags: bytes[at + 5]!,
      granule: view.getBigUint64(6, true),
      packets,
      crcOk: oggCrc(whole) === crc,
    });
    at += 27 + count + size;
  }
  return pages;
}
