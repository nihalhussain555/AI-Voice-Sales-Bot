import React, { useEffect, useRef } from 'react';
import { callRecorder } from '../services/audioRecorder.js';

export default function AudioVisualizer({ callStatus, isBotSpeaking, isCustomerSpeaking }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let phase = 0;

    const render = () => {
      // Handle high DPI
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isLive = callStatus !== 'idle' && callStatus !== 'ended';
      const numBars = 32;
      const barWidth = 4;
      const spacing = (width - numBars * barWidth) / (numBars + 1);

      // Real microphone spectrum when the customer channel is active; synthetic
      // wave otherwise (bot TTS output is not captured by the mic recorder).
      const freqData = (isCustomerSpeaking || (isLive && !isBotSpeaking))
        ? callRecorder.getAudioFrequencyData()
        : null;

      let barColor = 'rgba(148, 163, 184, 0.4)'; // slate-400 idle
      if (isBotSpeaking) {
        barColor = 'rgba(99, 102, 241, 0.85)'; // indigo
      } else if (isCustomerSpeaking) {
        barColor = 'rgba(16, 185, 129, 0.85)'; // emerald
      } else if (isLive) {
        barColor = 'rgba(129, 140, 248, 0.5)'; // subtle pulse
      }

      phase += 0.08;

      for (let i = 0; i < numBars; i++) {
        const x = spacing + i * (barWidth + spacing);
        let barHeight;

        if (freqData && freqData.length > 0) {
          const bin = freqData[Math.floor((i / numBars) * freqData.length)] || 0;
          barHeight = Math.max(4, (bin / 255) * (height - 8));
        } else {
          const targetAmplitude = isBotSpeaking ? 26 : isCustomerSpeaking ? 24 : isLive ? 8 : 4;
          const wave = Math.sin(phase + (i * 0.35)) * Math.cos(phase * 0.7 + (i * 0.2));
          barHeight = Math.max(4, Math.abs(wave) * targetAmplitude + (isLive ? 4 : 2));
        }

        const y = (height - barHeight) / 2;

        if (isBotSpeaking) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, '#818cf8');
          grad.addColorStop(1, '#4f46e5');
          ctx.fillStyle = grad;
        } else {
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          grad.addColorStop(0, isCustomerSpeaking ? '#34d399' : '#64748b');
          grad.addColorStop(1, isCustomerSpeaking ? '#059669' : '#475569');
          ctx.fillStyle = grad;
        }

        // Rounded bars
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [callStatus, isBotSpeaking, isCustomerSpeaking]);

  return (
    <div className="w-full flex items-center justify-center py-2 px-4 bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-800">
      <canvas 
        ref={canvasRef} 
        width={360} 
        height={48} 
        className="w-full max-w-[360px] h-12"
      />
    </div>
  );
}
