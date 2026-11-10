// Backend unit tests: run with `npm test` from backend/ (node --test src/tests).
// No real Twilio/Groq network calls: codecs + VAD + unconfigured HTTP behavior only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import {
  pcmToMulaw,
  mulawToPcm,
  linearToMulawBuffer,
  mulawBufferToLinear,
  buildWav,
  parseWav,
  resampleLinear,
  to8kMulawChunks,
  rmsEnergy
} from '../utils/audioCodecs.js';
import { EnergyVad } from '../services/telephony.js';

const EPS = 1e-6;

function relRmsError(a, b) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    num += d * d;
    den += b[i] * b[i];
  }
  return den === 0 ? 0 : Math.sqrt(num) / Math.sqrt(den);
}

function mulawRms(buf) {
  return rmsEnergy(mulawBufferToLinear(buf));
}

function pcmSine(freq, rate, amp, phase = 0) {
  return Array.from({ length: rate }, (_, i) =>
    Math.round(amp * Math.sin(2 * Math.PI * freq * (i + phase) / rate)));
}

test('mulaw round trip: 440Hz sine through encode/decode keeps RMS within ~1% and sample error < 2%', () => {
  const sine = Int16Array.from(pcmSine(440, 8000, 8000));
  const back = mulawBufferToLinear(linearToMulawBuffer(sine));
  assert.ok(relRmsError(back, sine) < 0.02, `sample RMS error too high: ${relRmsError(back, sine)}`);
  const eRatio = Math.abs(mulawRms(linearToMulawBuffer(sine)) / rmsEnergy(sine) - 1);
  assert.ok(eRatio < 0.02, `RMS drift too high: ${eRatio}`);
});

test('mulaw known answers: 0xff/0x7f are both zeros, encode(0) maps to a zero byte, 0x80 decodes to full scale, sign symmetry', () => {
  assert.equal(mulawToPcm(0xff), 0);
  assert.equal(mulawToPcm(0x7f), 0);
  assert.ok([0xff, 0x7f].includes(pcmToMulaw(0)));
  assert.ok(Math.abs(mulawToPcm(pcmToMulaw(0))) <= 8);
  assert.ok(Math.abs(mulawToPcm(0x80)) > 30000, '0x80 is the max positive code');
  for (let s = -30000; s <= 30000; s += 251) {
    assert.equal(mulawToPcm(pcmToMulaw(-s)), -mulawToPcm(pcmToMulaw(s)));
  }
});

test('mulaw table: all 256 bytes decode to Int16 range and re-encode consistently', () => {
  for (let b = 0; b < 256; b++) {
    const s = mulawToPcm(b);
    assert.ok(s >= -32768 && s <= 32767);
    assert.equal(mulawToPcm(pcmToMulaw(s)), s, `round trip failed for byte 0x${b.toString(16)}`);
  }
});

test('buildWav/parseWav round trip preserves samples exactly at 8000 and 24000 Hz', () => {
  for (const rate of [8000, 24000]) {
    const samples = Int16Array.from(Array.from({ length: 1000 }, (_, i) =>
      ((i * 7919) % 65536) - 32768));
    const parsed = parseWav(buildWav(samples, rate));
    assert.equal(parsed.sampleRate, rate);
    assert.equal(parsed.channels, 1);
    assert.deepEqual(Array.from(parsed.pcm), Array.from(samples));
  }
});

test('parseWav: float32 and 24-bit inputs convert to Int16, unknown chunks are skipped', () => {
  // 24-bit PCM: 0x7FFFFF -> full scale.
  const b24 = Buffer.alloc(44 + 3);
  b24.write('RIFF', 0); b24.writeUInt32LE(36 + 3, 4); b24.write('WAVE', 8);
  b24.write('fmt ', 12); b24.writeUInt32LE(16, 16); b24.writeUInt16LE(1, 20);
  b24.writeUInt16LE(1, 22); b24.writeUInt32LE(44100, 24); b24.writeUInt32LE(44100 * 3, 28);
  b24.writeUInt16LE(3, 32); b24.writeUInt16LE(24, 34);
  b24.write('data', 36); b24.writeUInt32LE(3, 40);
  b24[44] = 0xff; b24[45] = 0xff; b24[46] = 0x7f;
  const p24 = parseWav(b24);
  assert.equal(p24.pcm.length, 1);
  assert.ok(p24.pcm[0] > 32000, `24-bit full scale -> ${p24.pcm[0]}`);

  // float32 + an unknown LIST chunk before data.
  const f = new Float32Array([1.0, -0.5, 0.0]);
  const body = Buffer.from(f.buffer);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + body.length + 8, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(1, 22); head.writeUInt32LE(48000, 24); head.writeUInt32LE(48000 * 4, 28);
  head.writeUInt16LE(4, 32); head.writeUInt16LE(32, 34);
  head.write('LIST', 36); head.writeUInt32LE(0, 40);
  const buf = Buffer.concat([head, Buffer.from('data', 'ascii'), Buffer.alloc(4), body]);
  buf.writeUInt32LE(body.length, 48); // data chunk size (right after the 'data' magic at 44)
  const pf = parseWav(buf);
  assert.equal(pf.sampleRate, 48000);
  assert.equal(pf.pcm[0], 32767);
  assert.ok(Math.abs(pf.pcm[1] + 16383.5) < 1.5);
  assert.equal(pf.pcm[2], 0);

  assert.throws(() => parseWav(Buffer.from('not a wav at all!!')), /RIFF/);
});

test('resampleLinear: 24k->8k is a 3:1 downsample, DC stays constant, rates validated', () => {
  const input = new Int16Array(241).fill(-12345);
  const out = resampleLinear(input, 24000, 8000);
  assert.ok(out.length === 80 || out.length === 81, `expected ~input/3, got ${out.length}`);
  for (const v of out) assert.equal(v, -12345);

  const up = resampleLinear(new Int16Array(81).fill(500), 8000, 24000);
  assert.ok(up.length >= 240 && up.length <= 243, `8k->24k len=${up.length}`);

  const sweep = Int16Array.from({ length: 240 }, (_, i) => i * 10 - 1200);
  const down = resampleLinear(sweep, 24000, 8000);
  assert.ok(Math.abs(down[5] - sweep[15]) <= 1, 'linear interp tracks a ramp');

  assert.throws(() => resampleLinear(new Int16Array(4), 0, 8000), /rate/i);
});

test('to8kMulawChunks: 8000 samples @8kHz = 50 full 160-byte chunks; 80 samples = one small chunk; 24kHz input path', () => {
  const one = to8kMulawChunks(new Int16Array(8000), 8000);
  assert.equal(one.length, 50);
  for (const c of one) assert.equal(c.length, 160);

  const partial = to8kMulawChunks(new Int16Array(80), 8000);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].length, 80);

  const from24 = to8kMulawChunks(new Int16Array(2400), 24000);
  assert.equal(from24.length, 5);
  assert.equal(from24[0].length, 160);
});

test('EnergyVad: explicit gate flushes after the silence window, honors min speech and reset', () => {
  const vad = new EnergyVad({ sampleRate: 8000, gate: 500, silenceMs: 150, minSpeechMs: 100 });
  const loud = Int16Array.from(pcmSine(440, 8000, 6000));
  const quiet = new Int16Array(800); // 100ms of silence per chunk
  assert.equal(vad.gate, 500, 'explicit gate is honored');
  assert.ok(vad.pushSample(loud) === null);
  assert.equal(vad.pushSample(quiet), null, 'one silence chunk is under the 150ms window');
  const flushed = vad.pushSample(quiet);
  assert.ok(flushed instanceof Int16Array && flushed.length > 8000, 'second silence chunk flushes');
  assert.equal(vad.total, 0);
  assert.ok(!vad.inSpeech);
  assert.ok(vad.rms(quiet) === 0 && Math.abs(vad.rms(loud) - rmsEnergy(loud)) < EPS);

  // min speech: a 50ms blip then long silence must NOT flush.
  const vad2 = new EnergyVad({ sampleRate: 8000, gate: 500, silenceMs: 800, minSpeechMs: 500 });
  vad2.pushSample(Int16Array.from(pcmSine(440, 8000, 6000, 0).slice(0, 400)));
  for (let i = 0; i < 10; i++) assert.equal(vad2.pushSample(new Int16Array(800)), null);
  assert.equal(vad2.inSpeech, true, 'sub-minSpeech segment is still open');

  // adaptive mode: quiet-ish noise then loud speech flushes cleanly.
  const vad3 = new EnergyVad({ sampleRate: 8000, silenceMs: 300, minSpeechMs: 100 });
  for (let i = 0; i < 10; i++) vad3.pushSample(new Int16Array(400)); // noise floor ~0
  assert.ok(vad3.gate >= 300, 'adaptive gate stays above the min floor');
  for (let i = 0; i < 3; i++) vad3.pushSample(Int16Array.from(pcmSine(440, 8000, 6000, i).slice(0, 400)));
  const flushed3 = vad3.pushSample(Int16Array.from(pcmSine(440, 8000, 6000, 3).slice(0, 400)))
    ?? vad3.pushSample(new Int16Array(4000));
  assert.ok(flushed3 && flushed3.length > 0, 'adaptive vad flushes on trailing silence');
});

test('createTelephony without TWILIO_* env: not configured, webhooks answer 501, GET status reports off', async () => {
  const saved = {};
  const envKeys = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'PUBLIC_BASE_URL', 'TWILIO_VALIDATE'];
  for (const k of envKeys) { saved[k] = process.env[k]; delete process.env[k]; }

  const { createTelephony, EnergyVad: vadClass } = await import('../services/telephony.js');
  const { createCallLifecycle } = await import('../services/callLifecycle.js');
  const lifecycle = createCallLifecycle({ db: { saveCall: (c) => c } });
  const app = express();
  const tele = createTelephony({ lifecycle });
  assert.equal(tele.twilioConfigured, false);
  assert.equal(typeof tele.attachWebSocket, 'function');
  assert.equal(typeof vadClass, 'function');
  app.use(tele.router);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const form = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'CallSid=CAtest&From=%2B15005550006&To=%2B15005550001' };

    const voice = await fetch(`${base}/api/twilio/voice`, form);
    assert.equal(voice.status, 501);
    assert.match((await voice.text()).toLowerCase(), /not configured/);

    const statusCb = await fetch(`${base}/api/twilio/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'CallSid=CAtest&CallStatus=completed'
    });
    assert.equal(statusCb.status, 501);

    const status = await fetch(`${base}/api/twilio/status`);
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.equal(body.configured, false, 'nothing to receive inbound calls with');
    assert.equal(body.mode, 'off', 'and therefore no live dialing either');
    assert.ok(body.missing.includes('TWILIO_ACCOUNT_SID'));
    assert.equal(body.activeCalls, 0);
  } finally {
    await new Promise((r) => server.close(r));
    lifecycle.stop();
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
