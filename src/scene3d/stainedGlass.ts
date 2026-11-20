import { CanvasTexture, SRGBColorSpace } from 'three';

// Процедурный витраж: разноцветные стёкла в свинцовых переплётах. Файлы не загружаются.

const COLORS = ['#c2412d', '#e8a33d', '#2f7fb8', '#3f9e6b', '#8a4fb0', '#e6d36a', '#2a9ba8'];

/** Прозрачность витража (задача 20.5): стёкла просвечивают небо и мир, свинцовые переплёты почти непрозрачны. */
export const STAINED_GLASS = { glassAlpha: 0.5, leadAlpha: 0.95 } as const;

let cached: CanvasTexture | null = null;

export function stainedGlassTexture(): CanvasTexture {
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cells = 4;
  const step = size / cells;
  let seed = 7;
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      ctx.globalAlpha = STAINED_GLASS.glassAlpha;
      ctx.fillStyle = COLORS[Math.floor(next() * COLORS.length)]!;
      ctx.fillRect(col * step, row * step, step, step);
      // Светлый блик в углу каждой секции.
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(col * step, row * step, step / 2, step / 2);
    }
  }
  ctx.globalAlpha = STAINED_GLASS.leadAlpha;
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = 7;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  cached = new CanvasTexture(canvas);
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
