import React, { useEffect, useRef } from 'react';
import { callRecorder } from '../services/audioRecorder.js';
import { useThemeTokens } from '../context/theme.jsx';

const BARS = 32;
const BAR_WIDTH = 4;

// Real microphone spectrum while listening; a gentle synthetic wave otherwise,
// because text-to-speech output is not captured by the mic recorder.
export default function AudioVisualizer({ callStatus, isBotSpeaking, isCustomerSpeaking }) {
  const canvasRef = useRef(null);
  const tokens = useThemeTokens();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let frame;
    let phase = 0;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const isLive = callStatus !== 'idle' && callStatus !== 'ended';
      const spacing = (width - BARS * BAR_WIDTH) / (BARS + 1);
      const freqData = (isCustomerSpeaking || (isLive && !isBotSpeaking))
        ? callRecorder.getAudioFrequencyData()
        : null;

      const top = isBotSpeaking ? tokens.primary : isCustomerSpeaking ? tokens.success : isLive ? tokens.electric : tokens.inkMuted;
      const bottom = isBotSpeaking ? tokens.violet : isCustomerSpeaking ? tokens.success : isLive ? tokens.primary : tokens.inkMuted;
      const alpha = isLive ? 0.9 : 0.4;

      phase += 0.08;

      for (let i = 0; i < BARS; i++) {
        const x = spacing + i * (BAR_WIDTH + spacing);
        let barHeight;

        if (freqData && freqData.length > 0) {
          const bin = freqData[Math.floor((i / BARS) * freqData.length)] || 0;
          barHeight = Math.max(4, (bin / 255) * (height - 8));
        } else {
          const amplitude = isBotSpeaking ? 26 : isCustomerSpeaking ? 24 : isLive ? 8 : 4;
          const wave = Math.sin(phase + i * 0.35) * Math.cos(phase * 0.7 + i * 0.2);
          barHeight = Math.max(4, Math.abs(wave) * amplitude + (isLive ? 4 : 2));
        }

        const y = (height - barHeight) / 2;
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, top);
        gradient.addColorStop(1, bottom);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, barHeight, 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frame);
  }, [callStatus, isBotSpeaking, isCustomerSpeaking, tokens]);

  return (
    <div className="flex w-full items-center justify-center rounded-card border border-line bg-surface-3/50 px-4 py-3">
      <canvas
        ref={canvasRef}
        width={360}
        height={48}
        aria-hidden="true"
        className="h-12 w-full max-w-[360px]"
      />
    </div>
  );
}
