import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Процедурные обои (D-23, задача 28): узоры рисуются на canvas, файлы не загружаются.
// Каждый узор бесшовный: рисуется в квадрате size × size и повторяется по физическому размеру в см.

type Ctx = CanvasRenderingContext2D;
type Colors = [string, string, string];

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Рисует элемент во всех сдвигах на период, чтобы узор был бесшовным. */
function wrapped(size: number, draw: (dx: number, dy: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
}

function leaf(ctx: Ctx, x: number, y: number, length: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, -length * 0.38, length, 0);
  ctx.quadraticCurveTo(length * 0.5, length * 0.38, 0, 0);
  ctx.fill();
  ctx.restore();
}

function bird(ctx: Ctx, x: number, y: number, scale: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 10, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); ctx.arc(17, -8, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(23, -9); ctx.lineTo(32, -6); ctx.lineTo(23, -5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-40, 8); ctx.lineTo(-14, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, -6); ctx.quadraticCurveTo(-8, -26, 8, -22); ctx.quadraticCurveTo(4, -12, 4, -4); ctx.fill();
  ctx.restore();
}

/** Осветляет (amount > 0) или затемняет (< 0) цвет #rrggbb. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Цвет #rrggbb с прозрачностью для градиентов. */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const PATTERNS: Record<string, (ctx: Ctx, size: number, c: Colors) => void> = {
  // Ветви с листьями и птицами: серо-зелёная ботаника (образец пользователя).
  botanical(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(11);
    wrapped(size, (dx, dy) => {
      for (let i = 0; i < 5; i++) {
        const bx = (i * 0.23 + 0.06) * size + dx;
        const by = (0.1 + (i % 3) * 0.3) * size + dy;
        ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(bx, by);
        const ex = bx + 70 + r() * 40, ey = by + 90 + r() * 50;
        ctx.quadraticCurveTo(bx + 60, by + 20, ex, ey);
        ctx.stroke();
        for (let k = 1; k <= 5; k++) {
          const t = k / 6;
          const px = bx + (ex - bx) * t, py = by + (ey - by) * t * 0.95;
          leaf(ctx, px, py, 34 + r() * 14, -0.8 + r() * 0.4, k % 2 ? fg : accent);
          leaf(ctx, px, py, 30 + r() * 12, 0.9 + r() * 0.4, k % 2 ? accent : fg);
        }
      }
      bird(ctx, 0.62 * size + dx, 0.3 * size + dy, 0.9, fg);
      bird(ctx, 0.2 * size + dx, 0.78 * size + dy, 0.75, accent);
    });
  },
  // Крупные листья монстеры.
  monstera(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(5);
    wrapped(size, (dx, dy) => {
      for (let i = 0; i < 4; i++) {
        const x = (0.2 + (i % 2) * 0.5) * size + dx, y = (0.25 + Math.floor(i / 2) * 0.5) * size + dy;
        ctx.fillStyle = i % 2 ? fg : accent;
        ctx.beginPath(); ctx.ellipse(x, y, 74, 92, r() * 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = bg; ctx.lineWidth = 6;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k * 30, y - 80); ctx.stroke(); }
      }
    });
  },
  stripes(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;
    for (let x = 0; x < size; x += size / 8) ctx.fillRect(x, 0, size / 24, size);
  },
  wideStripes(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;
    for (let x = 0; x < size; x += size / 2) ctx.fillRect(x, 0, size / 4, size);
  },
  chevron(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = fg; ctx.lineWidth = 14;
    const step = size / 4;
    for (let y = -step; y <= size + step; y += step) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += size / 4) { const up = (x / (size / 4)) % 2 === 0; ctx.lineTo(x, y + (up ? 0 : step / 2)); }
      ctx.stroke();
    }
  },
  hexagons(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const rad = size / 6, h = Math.sqrt(3) * rad;
    ctx.lineWidth = 5;
    for (let row = -1; row < 7; row++) for (let col = -1; col < 7; col++) {
      const x = col * rad * 1.5, y = row * h + (col % 2 ? h / 2 : 0);
      ctx.strokeStyle = fg; ctx.fillStyle = (row + col) % 3 === 0 ? accent : bg;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx.lineTo(x + rad * Math.cos((k * Math.PI) / 3), y + rad * Math.sin((k * Math.PI) / 3));
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },
  // Ар-деко: веера.
  fans(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const rad = size / 4;
    for (let row = -1; row <= 4; row++) for (let col = -1; col <= 4; col++) {
      const x = col * rad * 2 + (row % 2 ? rad : 0), y = row * rad;
      for (let k = 3; k >= 1; k--) {
        ctx.beginPath(); ctx.arc(x, y + rad, rad * (k / 3), Math.PI, 0);
        ctx.strokeStyle = k % 2 ? fg : accent; ctx.lineWidth = 5; ctx.stroke();
      }
    }
  },
  terrazzo(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(23);
    wrapped(size, (dx, dy) => {
      const q = rng(23);
      for (let i = 0; i < 46; i++) {
        const x = q() * size + dx, y = q() * size + dy, w = 8 + q() * 22;
        ctx.fillStyle = [fg, accent, '#ffffff66'][i % 3]!;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + q(); ctx.lineTo(x + Math.cos(a) * w, y + Math.sin(a) * w * 0.7); }
        ctx.fill();
      }
    });
    void r;
  },
  marble(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(77);
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = i % 2 ? fg : accent; ctx.lineWidth = 1 + r() * 3; ctx.globalAlpha = 0.55;
      let x = 0, y = r() * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (x < size) { x += 20; y += (r() - 0.5) * 50; ctx.lineTo(x, ((y % size) + size) % size); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  concrete(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(3);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = fg; ctx.globalAlpha = r() * 0.12;
      const x = r() * size, y = r() * size; ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
    }
    ctx.globalAlpha = 1;
  },
  dots(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const step = size / 6;
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      ctx.fillStyle = (row + col) % 2 ? fg : accent;
      ctx.beginPath(); ctx.arc(col * step + step / 2, row * step + step / 2, step / 5, 0, Math.PI * 2); ctx.fill();
    }
  },
  // Японские волны.
  waves(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const rad = size / 6;
    ctx.strokeStyle = fg; ctx.lineWidth = 4;
    for (let row = -1; row < 8; row++) for (let col = -1; col < 8; col++) {
      const x = col * rad * 2 + (row % 2 ? rad : 0), y = row * rad;
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(x, y, (rad * k) / 3, Math.PI, 0); ctx.stroke(); }
    }
  },
  // Арки в бохо-стиле.
  arches(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const w = size / 3;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const x = col * w + w * 0.15, y = row * w + w * 0.1;
      ctx.fillStyle = (row + col) % 2 ? fg : accent;
      ctx.beginPath(); ctx.moveTo(x, y + w * 0.8); ctx.lineTo(x, y + w * 0.35);
      ctx.arc(x + w * 0.35, y + w * 0.35, w * 0.35, Math.PI, 0); ctx.lineTo(x + w * 0.7, y + w * 0.8); ctx.fill();
    }
  },
  // Современная геометрия: пересекающиеся круги.
  circles(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const rad = size / 4;
    wrapped(size, (dx, dy) => {
      for (const [cx, cy, col] of [[0.25, 0.25, fg], [0.75, 0.75, fg], [0.75, 0.25, accent], [0.25, 0.75, accent]] as const) {
        ctx.strokeStyle = col; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(cx * size + dx, cy * size + dy, rad, 0, Math.PI * 2); ctx.stroke();
      }
    });
  },
  // Льняная фактура.
  linen(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(9);
    ctx.strokeStyle = fg; ctx.lineWidth = 1;
    for (let i = 0; i < 700; i++) {
      ctx.globalAlpha = 0.1 + r() * 0.18;
      const x = r() * size, y = r() * size, horizontal = r() > 0.5, len = 20 + r() * 50;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(horizontal ? x + len : x, horizontal ? y : y + len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // ——— Дизайнерская серия (запрос 19.11.2026): крупный масштаб, мягкие градиенты, тонкие линии. ———

  // Крупные тропические листья банана и пальмы в близких тонах на глубоком фоне.
  tropical(ctx, size, [bg, fg, accent]) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, bg); g.addColorStop(1, shade(bg, -0.18));
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const r = rng(31);
    const frond = (x: number, y: number, len: number, angle: number, color: string) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.strokeStyle = shade(color, 0.25); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.08, len, 0); ctx.stroke();
      const leaves = 9;
      for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 1), px = len * t, py = -len * 0.08 * Math.sin(Math.PI * t) * 0.9;
        const l = len * 0.3 * (1 - Math.abs(t - 0.45) * 0.9);
        for (const side of [-1, 1]) {
          ctx.fillStyle = shade(color, (i % 2 ? 0.08 : -0.06));
          ctx.beginPath(); ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + l * 0.35, py + side * l * 0.55, px + l * 0.9, py + side * l * 0.95);
          ctx.quadraticCurveTo(px + l * 0.45, py + side * l * 0.28, px, py); ctx.fill();
        }
      }
      ctx.restore();
    };
    wrapped(size, (dx, dy) => {
      frond(0.12 * size + dx, 0.30 * size + dy, 0.55 * size, -0.55, fg);
      frond(0.75 * size + dx, 0.92 * size + dy, 0.6 * size, -2.2, accent);
      frond(0.55 * size + dx, 0.10 * size + dy, 0.45 * size, 0.7, shade(fg, -0.12));
      frond(0.10 * size + dx, 0.85 * size + dy, 0.4 * size, -1.0 + r() * 0.1, shade(accent, -0.1));
    });
  },

  // Листья гинкго, разбросанные в двух тонах, с золотистыми прожилками.
  ginkgo(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(47);
    // Лист гинкго: веер с вырезом сверху и черешком; прожилки расходятся от основания.
    const leaf2 = (x: number, y: number, rad: number, angle: number, color: string) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      const spread = 1.15; // половина угла веера, рад
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, rad, -Math.PI / 2 - spread, -Math.PI / 2 - 0.07, false);
      ctx.lineTo(0, -rad * 0.72);
      ctx.lineTo(Math.cos(-Math.PI / 2 + 0.07) * rad, Math.sin(-Math.PI / 2 + 0.07) * rad);
      ctx.arc(0, 0, rad, -Math.PI / 2 + 0.07, -Math.PI / 2 + spread, false);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      for (let k = -5; k <= 5; k++) {
        const t = -Math.PI / 2 + (k / 5) * (spread - 0.1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * rad * 0.95, Math.sin(t) * rad * 0.95); ctx.stroke();
      }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, rad * 0.35); ctx.stroke();
      ctx.restore();
    };
    wrapped(size, (dx, dy) => {
      for (let i = 0; i < 12; i++) {
        const x = ((i * 0.137 + 0.05) % 1) * size + dx, y = ((i * 0.31 + 0.1) % 1) * size + dy;
        leaf2(x, y, 42 + (i % 3) * 12, r() * Math.PI * 2, i % 3 === 0 ? accent : fg);
      }
    });
  },

  // Мягкая акварельная абстракция с золотой жилой: «дизайнерский мрамор».
  wash(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(61);
    wrapped(size, (dx, dy) => {
      for (let i = 0; i < 6; i++) {
        const x = r() * size + dx, y = r() * size + dy, rad = size * (0.25 + r() * 0.25);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, hexA(i % 2 ? fg : shade(fg, -0.2), 0.55)); g.addColorStop(1, hexA(bg, 0));
        ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    });
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      let x = 0, y = (0.15 + i * 0.33) * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (x < size) { x += 24; y += (r() - 0.45) * 26; ctx.lineTo(x, y); }
      ctx.lineTo(size, ((0.15 + i * 0.33) * size)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // Тканое полотно (грасcлотх): горизонтальные волокна с тёплой поперечной нитью.
  grasscloth(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const r = rng(73);
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = r() > 0.5 ? fg : accent; ctx.globalAlpha = 0.05 + r() * 0.12;
      ctx.fillRect(0, y, size, 1 + r() * 2);
    }
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = r() > 0.5 ? fg : '#ffffff'; ctx.globalAlpha = 0.06 + r() * 0.1; ctx.lineWidth = 1;
      const x = r() * size, y = r() * size, len = 30 + r() * 120;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (r() - 0.5) * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // Тонкие латунные линии: диагональная решётка по тёмному полотну.
  brass(ctx, size, [bg, fg, accent]) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, bg); g.addColorStop(1, shade(bg, 0.08));
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
    const n = 4, step = size / n;
    for (let i = -n; i <= 2 * n; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step + size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * step, size); ctx.lineTo(i * step + size, 0); ctx.stroke();
    }
    ctx.fillStyle = fg;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.beginPath(); ctx.arc((i + 0.5) * step, (j + 0.5) * step, 5, 0, Math.PI * 2); ctx.fill();
    }
  },

  // Мягкие арки-радуга: тонкие концентрические дуги в спокойной палитре.
  rainbow(ctx, size, [bg, fg, accent]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const rad = size / 4;
    wrapped(size, (dx, dy) => {
      for (const [cx, cy] of [[0.25, 0.5], [0.75, 0.5]] as const) {
        for (let k = 5; k >= 1; k--) {
          ctx.fillStyle = k % 2 ? fg : accent; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.arc(cx * size + dx, (cy + 0.25) * size + dy, (rad * k) / 5.5, Math.PI, 0); ctx.fill();
        }
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(cx * size + dx, (cy + 0.25) * size + dy, rad / 5.5 * 0.6, Math.PI, 0); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  },

  // Вертикальные рейки (имитация панелей).
  slats(ctx, size, [bg, fg]) {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    const w = size / 8;
    for (let x = 0; x < size; x += w) {
      ctx.fillStyle = fg; ctx.fillRect(x, 0, 3, size);
      ctx.fillStyle = '#ffffff14'; ctx.fillRect(x + 3, 0, w / 3, size);
    }
  },
  // Покрытия пола (D-16, задача 23). Ламинат: доски 19 × 120 см, холст = 120 × 76 см (4 ряда досок, ширина = длина доски).
  laminate(ctx, size, [base, seam, accent]) {
    const rows = 4;
    const h = size / rows;
    const r = rng(23);
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < rows; row++) {
      // Стыки досок смещены между рядами; одна доска = вся ширина тайла, поэтому стык на краю сдвинут.
      const offset = ((row * 0.37) % 1) * size;
      for (const dx of [-size, 0]) {
        const x = offset + dx;
        const shade = 0.06 + r() * 0.1;
        ctx.fillStyle = r() > 0.5 ? accent : seam;
        ctx.globalAlpha = shade;
        ctx.fillRect(x, row * h, size, h);
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = seam; ctx.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
          const y = row * h + (0.08 + r() * 0.84) * h;
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + size * 0.3, y + (r() - 0.5) * 6, x + size * 0.6, y + (r() - 0.5) * 6, x + size, y + (r() - 0.5) * 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = seam;
        ctx.fillRect(x, row * h, Math.max(2, size / 256), h);
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = seam;
      ctx.fillRect(0, row * h, size, Math.max(2, size / 200));
      ctx.globalAlpha = 1;
    }
  },
  // Линолеум: ровный фон с мелкой крапинкой, холст 100 × 100 см.
  linoleum(ctx, size, [base, speck, light]) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    const r = rng(31);
    const count = Math.round(size * 3);
    for (let i = 0; i < count; i++) {
      const x = r() * size, y = r() * size, radius = (0.4 + r() * 1.4) * (size / 256);
      ctx.fillStyle = r() > 0.5 ? speck : light;
      ctx.globalAlpha = 0.12 + r() * 0.2;
      wrapped(size, (dx, dy) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, radius, 0, Math.PI * 2); ctx.fill(); });
    }
    ctx.globalAlpha = 1;
  },
  // Ковролин: плотный мелкий ворс, холст 50 × 50 см.
  carpet(ctx, size, [base, dark, light]) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    const r = rng(47);
    const count = size * size / 18;
    for (let i = 0; i < count; i++) {
      const x = r() * size, y = r() * size;
      ctx.fillStyle = r() > 0.5 ? dark : light;
      ctx.globalAlpha = 0.1 + r() * 0.25;
      const w = Math.max(1, size / 256), l = w * (1 + r() * 2);
      wrapped(size, (dx, dy) => ctx.fillRect(x + dx, y + dy, w, l));
    }
    ctx.globalAlpha = 1;
  },
};

export const PATTERN_KINDS = Object.keys(PATTERNS);

const cache = new Map<string, HTMLCanvasElement>();

/** Холст узора заданного размера; одинаковые параметры используют один холст. */
export function patternCanvas(kind: string, colors: Colors, size = 512): HTMLCanvasElement {
  const key = `${kind}|${colors.join(',')}|${size}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const draw = PATTERNS[kind];
  if (!draw) throw new Error(`Неизвестный узор обоев: ${kind}`);
  draw(canvas.getContext('2d')!, size, colors);
  cache.set(key, canvas);
  return canvas;
}

export function patternTexture(kind: string, colors: Colors): CanvasTexture {
  const texture = new CanvasTexture(patternCanvas(kind, colors));
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
