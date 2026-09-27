import { LANDMARKS } from "@freeharmony/engine";

type XY = { x: number; y: number };
type Cloud = ReadonlyArray<XY | undefined>;

/**
 * Ear to ear along the jaw. The chin and both jaw angles sit on this chain,
 * so a move at one of them can be shared with the points between.
 */
const JAW_CHAIN = [
  234, 93, 132, 58,
  ...LANDMARKS.MANDIBLE_CONTOUR,
  288, 361, 323, 454,
] as const;

/** These always bracket the curve, even when a metric did not move them. */
const ANCHORS = new Set<number>([234, 454, LANDMARKS.R_GONION, LANDMARKS.L_GONION, LANDMARKS.MENTON]);

const MOUTH = new Set<number>(LANDMARKS.REGION_SETS.mouth);
const ON_CHAIN = new Set<number>(JAW_CHAIN);

function smooth(s: number): number {
  const t = s < 0 ? 0 : s > 1 ? 1 : s;
  return t * t * (3 - 2 * t);
}

/**
 * Blend two jaw moves so the bigger one carries the points between them.
 * A straight blend leaves almost the whole shift on the last vertex.
 */
function blend(da: XY, db: XY, s: number): XY {
  const magA = Math.hypot(da.x, da.y);
  const magB = Math.hypot(db.x, db.y);
  let e = smooth(s);
  if (magB > magA + 1e-4) e = Math.pow(s, 0.3);
  else if (magA > magB + 1e-4) e = 1 - Math.pow(1 - s, 0.3);
  return { x: da.x + (db.x - da.x) * e, y: da.y + (db.y - da.y) * e };
}

/**
 * Share a chin or jaw-angle move with the rest of the mandible.
 * One landmark pulled on its own turns the chin into a spike.
 */
export function spreadJaw(points: Cloud, targets: Record<number, XY>): Record<number, XY> {
  const moved = JAW_CHAIN.some((id) => targets[id]);
  if (!moved) return targets;

  const deltaAt = (id: number): XY | null => {
    const p = points[id];
    if (!p) return null;
    const t = targets[id];
    if (t) return { x: t.x - p.x, y: t.y - p.y };
    if (ANCHORS.has(id)) return { x: 0, y: 0 };
    return null;
  };

  const drivers = JAW_CHAIN.map((id) => deltaAt(id));
  const applied: Array<XY | null> = drivers.map((d) => d);
  const out: Record<number, XY> = { ...targets };

  for (let i = 0; i < JAW_CHAIN.length; i++) {
    if (drivers[i]) continue;
    let a = i - 1;
    while (a >= 0 && !drivers[a]) a--;
    let b = i + 1;
    while (b < JAW_CHAIN.length && !drivers[b]) b++;
    if (a < 0 || b >= JAW_CHAIN.length) continue;
    const p = points[JAW_CHAIN[i]!];
    const da = drivers[a]!;
    const db = drivers[b]!;
    if (!p) continue;
    const d = blend(da, db, (i - a) / (b - a));
    applied[i] = d;
    if (Math.hypot(d.x, d.y) < 0.002) continue;
    out[JAW_CHAIN[i]!] = { x: p.x + d.x, y: p.y + d.y };
  }

  // The outline is only the edge. The chin pad inside it has to travel
  // with that edge, or the skin collapses onto the one point that moved.
  const menton = points[LANDMARKS.MENTON];
  const lip = points[17];
  const right = points[LANDMARKS.R_GONION];
  const left = points[LANDMARKS.L_GONION];
  if (menton && lip && right && left) {
    const span = menton.y - lip.y;
    const minX = Math.min(right.x, left.x) - 0.02;
    const maxX = Math.max(right.x, left.x) + 0.02;
    if (span > 1e-4) {
      for (let id = 0; id < points.length; id++) {
        if (out[id] || ON_CHAIN.has(id) || MOUTH.has(id)) continue;
        const p = points[id];
        if (!p || p.y <= lip.y || p.x < minX || p.x > maxX) continue;
        const along = p.y >= menton.y ? 1 : Math.min(1, (p.y - lip.y) / span);
        const w = Math.sqrt(along);
        if (w < 0.08) continue;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < JAW_CHAIN.length; i++) {
          const c = points[JAW_CHAIN[i]!];
          if (!c || !applied[i]) continue;
          const dist = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
          if (dist < bestD) {
            bestD = dist;
            best = i;
          }
        }
        const d = best >= 0 ? applied[best] : null;
        if (!d || Math.hypot(d.x, d.y) * w < 0.002) continue;
        out[id] = { x: p.x + d.x * w, y: p.y + d.y * w };
      }
    }
  }

  return out;
}

/**
 * The neck has no landmarks, so a moved chin is a triangle into the collar.
 * Pins under the jaw follow the mandible and fade out, so the whole jaw
 * lengthens instead of a single point.
 */
export function pinJaw(
  points: Cloud,
  targets: Record<number, XY>,
): { points: Cloud; targets: Record<number, XY> } {
  const spread = spreadJaw(points, targets);
  const menton = points[LANDMARKS.MENTON];
  const right = points[LANDMARKS.R_GONION];
  const left = points[LANDMARKS.L_GONION];
  if (!menton || !right || !left) return { points, targets: spread };

  const samples: { x: number; y: number; dx: number; dy: number }[] = [];
  const jawTop = Math.min(right.y, left.y);
  for (let id = 0; id < points.length; id++) {
    const p = points[id];
    const t = spread[id];
    if (!p || !t || p.y < jawTop - 0.04) continue;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    if (Math.hypot(dx, dy) < 0.002) continue;
    samples.push({ x: p.x, y: p.y, dx, dy });
  }
  if (samples.length === 0) return { points, targets: spread };

  const next = points.slice();
  const out: Record<number, XY> = { ...spread };
  const minX = Math.min(right.x, left.x) - 0.05;
  const maxX = Math.max(right.x, left.x) + 0.05;
  const top = jawTop - 0.01;
  const bot = Math.min(0.97, menton.y + 0.14);
  let id = next.length;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      const x = minX + ((maxX - minX) * c) / 7;
      const y = top + ((bot - top) * r) / 4;
      let crowded = false;
      for (const p of points) {
        if (p && (p.x - x) ** 2 + (p.y - y) ** 2 < 0.00018) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      let wsum = 0;
      let dx = 0;
      let dy = 0;
      for (const s of samples) {
        const w = Math.exp(-((s.x - x) ** 2 + (s.y - y) ** 2) / 0.004);
        wsum += w;
        dx += s.dx * w;
        dy += s.dy * w;
      }
      if (wsum < 1e-4) continue;
      const below = Math.max(0, (y - menton.y) / 0.14);
      const fade = 1 - below * below;
      if (fade <= 0) continue;
      dx = (dx / wsum) * fade;
      dy = (dy / wsum) * fade;
      if (Math.hypot(dx, dy) < 0.002) continue;
      next[id] = { x, y };
      out[id] = { x: x + dx, y: y + dy };
      id++;
    }
  }
  return { points: next, targets: out };
}
