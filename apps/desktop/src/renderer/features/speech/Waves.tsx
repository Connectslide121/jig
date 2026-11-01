import { useEffect, useRef } from "react";
import { cn, reducedMotion } from "../../ui";
import { meters } from "./meter";
import { useVoice } from "./voice";

/** Theme colours for the canvas, read from the tokens (so every theme works). */
function token(name: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || "currentColor"
  );
}

/** Fades a wave out towards both edges (x from -1 to 1). */
const envelope = (x: number) => (2 / (2 + x ** 4)) ** 4;

interface Layer {
  freq: number;
  speed: number;
  scale: number;
  alpha: number;
  width: number;
}
const LAYERS: Layer[] = [
  { freq: 1.6, speed: 2.4, scale: 1, alpha: 1, width: 2 },
  { freq: 2.4, speed: -3.1, scale: 0.7, alpha: 0.5, width: 1.5 },
  { freq: 3.3, speed: 1.7, scale: 0.45, alpha: 0.28, width: 1 },
];

/**
 * Sound waves for talking with Claude (D-210): blue for you (your microphone), the accent colour
 * for Claude (a pulse per word it says). A calm line while listening, a slow shimmer while Claude
 * thinks, flat when muted.
 */
export function Waves({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let frame = 0;
    const read = () => ({ you: token("info"), claude: token("accent"), quiet: token("hint") });
    let colors = read();
    // The theme may change while talking.
    const recolor = setInterval(() => (colors = read()), 1000);
    const still = reducedMotion();
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { phase, muted } = useVoice.getState();
      const t = still ? 0 : now / 1000;
      const you = meters.you.sample(now);
      const claude = meters.claude.sample(now);
      const mid = h / 2;
      const max = h / 2 - 4;
      const wave = (color: string, height: number, offset: number) => {
        for (const layer of LAYERS) {
          ctx.beginPath();
          ctx.globalAlpha = layer.alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = layer.width;
          for (let px = 0; px <= w; px += 2) {
            const x = (px / w) * 2 - 1;
            const y =
              mid +
              max *
                height *
                layer.scale *
                envelope(x) *
                Math.sin(x * Math.PI * layer.freq + t * layer.speed + offset);
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      };
      if (phase === "off" || phase === "starting" || muted) {
        wave(colors.quiet, 0.02, 0);
      } else {
        // A calm breath while listening; a slow shimmer while Claude thinks.
        const idle =
          phase === "thinking" ? 0.08 + 0.05 * Math.sin(t * 3) : phase === "listening" ? 0.05 : 0.03;
        wave(colors.claude, Math.max(claude, phase === "thinking" ? idle : 0.02), 1.3);
        wave(colors.you, Math.max(you, phase === "thinking" ? 0.02 : idle), 0);
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(recolor);
    };
  }, []);
  return <canvas ref={canvas} aria-hidden className={cn("block h-full w-full", className)} />;
}
