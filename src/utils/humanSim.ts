/**
 * Simulação humana p/ reduzir bot-detection (reCAPTCHA v2 e afins) — helpers
 * puros, sem playwright: viewport realista, pausas com jitter e caminho de
 * mouse não-linear. CAPTCHA continua escalando p/ humano (feature/09) — isto é
 * prevenção, não bypass.
 */

export interface Point {
  x: number;
  y: number;
}

/** Resoluções mais comuns de desktop — evita o 1280x800 fixo que denuncia bot. */
export const COMMON_VIEWPORTS: ReadonlyArray<{ width: number; height: number }> = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
];

export function randInt(min: number, max: number, rng: () => number = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Sorteia um viewport da lista — uma vez por launch (sessão consistente). */
export function pickViewport(rng: () => number = Math.random): { width: number; height: number } {
  return COMMON_VIEWPORTS[randInt(0, COMMON_VIEWPORTS.length - 1, rng)];
}

/**
 * Caminho de mouse com desvio lateral: ponto final sempre o destino, com
 * 2–5 waypoints interpolados e jitter perpendicular — polilinha imperfeita
 * em vez de reta perfeita ou teleporte.
 */
export function humanPathTo(from: Point, to: Point, rng: () => number = Math.random): Point[] {
  const steps = randInt(3, 6, rng);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Versor perpendicular p/ desviar lateralmente (±12% do comprimento, cap 40px)
  const nx = -dy / len;
  const ny = dx / len;
  const points: Point[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const side = (rng() - 0.5) * 2 * Math.min(len * 0.12, 40);
    points.push({
      x: Math.round(from.x + dx * t + nx * side),
      y: Math.round(from.y + dy * t + ny * side),
    });
  }
  points.push({ x: Math.round(to.x), y: Math.round(to.y) });
  return points;
}

/**
 * Delay/char p/ digitação humana: respostas longas digitam mais rápido —
 * cap em 3s total p/ não arrastar texto dissertativo.
 */
export function typeDelayFor(len: number, rng: () => number = Math.random): number {
  const perChar = Math.min(50, Math.max(8, Math.floor(3000 / Math.max(len, 1))));
  return randInt(Math.floor(perChar * 0.6), perChar, rng);
}
