// Audio Recorder utility to record user microphone and call audio

class CallAudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.isRecording = false;
  }

  async start() {
    this.audioChunks = [];
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia not supported in this browser");
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Set up AudioContext for real-time waveform visualizer
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
      }

      // Options for MediaRecorder
      let options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = {};
        }
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(200); // Collect slice every 200ms
      this.isRecording = true;
      return true;
    } catch (err) {
      console.warn("Microphone access unavailable or denied:", err);
      this.isRecording = false;
      return false;
    }
  }

  getAudioFrequencyData() {
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      return this.dataArray;
    }
    return null;
  }

  async stop() {
    if (!this.isRecording && this.audioChunks.length === 0) {
      // Fallback: Generate a sample synthetic audio tone blob if microphone wasn't active
      return this.generateSyntheticAudio();
    }

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        this.cleanup();
        resolve({ blob, url });
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mime });
        const url = URL.createObjectURL(blob);
        this.cleanup();
        resolve({ blob, url });
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        this.cleanup();
        resolve({ blob, url });
      }
    });
  }

  cleanup() {
    this.isRecording = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
  }

  // Create a pleasant synthetic audio note buffer if microphone was blocked
  async generateSyntheticAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const sampleRate = 44100;
      const duration = 2.5; // seconds
      const frameCount = sampleRate * duration;
      const audioBuffer = ctx.createBuffer(1, frameCount, sampleRate);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        // Cordial melodic chime
        channelData[i] = Math.sin(2 * Math.PI * 440 * t) * Math.exp(-t * 1.5) * 0.3;
      }

      // Convert audio buffer to simple wav blob
      const wavBlob = audioBufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      ctx.close();
      return { blob: wavBlob, url };
    } catch (e) {
      const emptyBlob = new Blob([], { type: 'audio/webm' });
      return { blob: emptyBlob, url: '' };
    }
  }
}

// Helper to convert Web Audio Buffer to WAV Blob
function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) {
      out.setUint8(pos++, s.charCodeAt(i));
    }
  }

  writeString('RIFF');
  out.setUint32(pos, length - 8, true); pos += 4;
  writeString('WAVE');
  writeString('fmt ');
  out.setUint32(pos, 16, true); pos += 4;
  out.setUint16(pos, 1, true); pos += 2;
  out.setUint16(pos, numOfChan, true); pos += 2;
  out.setUint32(pos, sampleRate, true); pos += 4;
  out.setUint32(pos, sampleRate * 2 * numOfChan, true); pos += 4;
  out.setUint16(pos, numOfChan * 2, true); pos += 2;
  out.setUint16(pos, 16, true); pos += 2;
  writeString('data');
  out.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}

export const callRecorder = new CallAudioRecorder();
