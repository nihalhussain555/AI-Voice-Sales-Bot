// G.711 u-law codec + WAV container helpers for the phone telephony pipeline.
// Pure functions only: no I/O, no env reads, safe to unit-test in isolation.

// ---------------------------------------------------------------------------
// u-law (ITU-T G.711, mu=255, segment/offset method)
// ---------------------------------------------------------------------------

// Segment upper bounds in the 13-bit law domain.
// Decode law (13-bit): mag13 = (2q + 33) * 2^seg - 33, scaled x4 into 16-bit.
// Encode's segment search uses the ITU bias form: seg = smallest s with
// (mag13 + 33) <= 64 << s, which reproduces decode exactly at table points.

// Decode table built programmatically at module load:
// mag13 = (2q + 33) * 2^seg - 33, scaled x4 into the 16-bit sample domain.
const MULAW_DECODE = new Int16Array(256);
for (let byte = 0; byte < 256; byte++) {
  const c = ~byte & 0xff; // wire bytes are complemented
  const seg = (c >> 4) & 0x07;
  const q = c & 0x0f;
  const mag = (((2 * q + 33) << seg) - 33) * 4;
  MULAW_DECODE[byte] = (c & 0x80) ? -mag : mag;
}

export function mulawToPcm(byte) {
  return MULAW_DECODE[byte & 0xff];
}

export function pcmToMulaw(sample) {
  const negative = sample < 0;
  let mag = negative ? -sample : sample;
  if (mag > 32635) mag = 32635; // keep inside the law after scaling
  const v = (mag + 2) >> 2;     // 16-bit -> 13-bit domain, +2 = round-to-nearest step
  const biased = v + 33;
  let seg = 0;
  while (seg < 7 && biased > (64 << seg)) seg++;
  let q = Math.round((Math.round(biased / (1 << seg)) - 33) / 2);
  if (q < 0) q = 0;
  if (q > 15) q = 15;
  return ((seg << 4) | q) ^ (negative ? 0x7f : 0xff);
}

export function linearToMulawBuffer(samples) {
  const out = Buffer.allocUnsafe(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = pcmToMulaw(samples[i]);
  return out;
}

export function mulawBufferToLinear(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = MULAW_DECODE[buf[i]];
  return out;
}

// ---------------------------------------------------------------------------
// WAV container
// ---------------------------------------------------------------------------

export function buildWav(pcmInt16, sampleRate, channels = 1) {
  if (!(sampleRate > 0)) throw new Error(`buildWav: invalid sampleRate ${sampleRate}`);
  if (!(channels >= 1)) throw new Error(`buildWav: invalid channels ${channels}`);
  const dataBytes = pcmInt16.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // canonical fmt chunk size
  buf.writeUInt16LE(1, 20);         // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);        // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < pcmInt16.length; i++) buf.writeInt16LE(pcmInt16[i] | 0, 44 + i * 2);
  return buf;
}

// Returns {sampleRate, channels, pcm:Int16Array}. Samples stay interleaved as in
// the file; callers working with mono telephony/Groq audio see channels=1.
export function parseWav(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) && !(wavBuffer instanceof Uint8Array)) {
    throw new Error('parseWav: expected a Buffer of WAV bytes');
  }
  const buf = Buffer.isBuffer(wavBuffer) ? wavBuffer : Buffer.from(wavBuffer);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('parseWav: not a RIFF/WAVE file');
  }

  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (body + size > buf.length && id !== 'data') {
      // Trailing/truncated unknown chunk: stop rather than read garbage.
      break;
    }
    if (id === 'fmt ') {
      if (size < 16) throw new Error('parseWav: fmt chunk too small');
      let audioFormat = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const sampleRate = buf.readUInt32LE(body + 4);
      const bitsPerSample = buf.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE hides the real format in the sub-Format GUID.
      if (audioFormat === 0xfffe && body + 26 <= buf.length) audioFormat = buf.readUInt16LE(body + 24);
      fmt = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, buf.length - body);
    }
    // Chunks are 1-byte aligned; odd sizes carry a padding byte.
    off = body + size + (size & 1);
  }

  if (!fmt) throw new Error('parseWav: missing fmt chunk');
  if (dataOffset < 0) throw new Error('parseWav: missing data chunk');
  if (!fmt.channels || !fmt.sampleRate) throw new Error('parseWav: bogus fmt chunk header');

  const { audioFormat, channels, sampleRate, bitsPerSample } = fmt;
  const bytesPerFrame = Math.max(1, Math.round((bitsPerSample / 8) * channels));
  const frames = Math.floor(dataLength / bytesPerFrame);
  const pcm = new Int16Array(frames * channels);

  const clamp16 = (x) => {
    if (Number.isNaN(x)) return 0;
    if (x > 32767) return 32767;
    if (x < -32768) return -32768;
    return Math.round(x);
  };

  for (let f = 0; f < frames; f++) {
    const base = dataOffset + f * bytesPerFrame;
    for (let ch = 0; ch < channels; ch++) {
      let value = 0;
      if (audioFormat === 1) {
        if (bitsPerSample === 16) value = buf.readInt16LE(base + ch * 2);
        else if (bitsPerSample === 8) value = (buf.readUInt8(base + ch) - 128) << 8;
        else if (bitsPerSample === 24) value = (buf.readIntLE(base + ch * 3, 3) >> 8);
        else if (bitsPerSample === 32) value = buf.readInt32LE(base + ch * 4) >> 16;
        else throw new Error(`parseWav: unsupported PCM bit depth ${bitsPerSample}`);
      } else if (audioFormat === 3) {
        if (bitsPerSample === 32) value = buf.readFloatLE(base + ch * 4) * 32767;
        else if (bitsPerSample === 64) value = buf.readDoubleLE(base + ch * 8) * 32767;
        else throw new Error(`parseWav: unsupported float bit depth ${bitsPerSample}`);
      } else {
        throw new Error(`parseWav: unsupported WAV format tag 0x${audioFormat.toString(16)}`);
      }
      pcm[f * channels + ch] = clamp16(value);
    }
  }

  return { sampleRate, channels, pcm };
}

// ---------------------------------------------------------------------------
// Resampling / chunking / energy
// ---------------------------------------------------------------------------

// Linear-interpolation resample; used for Groq Orpheus (24kHz) -> telephony 8kHz.
export function resampleLinear(input, fromRate, toRate) {
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error(`resampleLinear: bad rates ${fromRate}->${toRate}`);
  if (input.length === 0) return new Int16Array(0);
  if (fromRate === toRate || input.length === 1) return Int16Array.from(input);
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor((input.length - 1) / ratio) + 1);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = input[i0];
    const b = input[Math.min(i0 + 1, input.length - 1)];
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

// PCM at any rate -> array of 20ms u-law telephony chunks (160 bytes @ 8kHz).
export function to8kMulawChunks(pcmInt16, sampleRateIn, chunkBytes = 160) {
  if (!(chunkBytes > 0)) throw new Error('to8kMulawChunks: chunkBytes must be positive');
  const pcm8k = sampleRateIn === 8000 ? pcmInt16 : resampleLinear(pcmInt16, sampleRateIn, 8000);
  const mulaw = linearToMulawBuffer(pcm8k);
  const chunks = [];
  for (let off = 0; off < mulaw.length; off += chunkBytes) {
    chunks.push(mulaw.subarray(off, Math.min(off + chunkBytes, mulaw.length)));
  }
  return chunks;
}

export function rmsEnergy(pcm) {
  if (!pcm || pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i];
    sum += s * s;
  }
  return Math.sqrt(sum / pcm.length);
}
