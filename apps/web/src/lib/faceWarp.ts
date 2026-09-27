/** Piecewise-affine warp of a photo from one landmark set to another. */

export type XY = { x: number; y: number };

/** Image corners and edge midpoints. These stay put so the background does not swim. */
export function frameAnchors(w: number, h: number): XY[] {
  const pts: XY[] = [];
  for (const x of [0, w / 2, w - 1]) {
    for (const y of [0, h / 2, h - 1]) pts.push({ x, y });
  }
  return pts;
}

/**
 * Bowyer–Watson Delaunay. Returns triangles as index triples into `pts`.
 * Degenerate inputs return an empty list.
 */
export function triangulate(pts: readonly XY[]): number[][] {
  const n = pts.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);
  const d = Math.max(dx, dy) * 8;
  const s0 = n;
  const s1 = n + 1;
  const s2 = n + 2;
  const all: XY[] = pts.slice();
  all.push({ x: minX - d, y: minY - d });
  all.push({ x: minX + dx / 2, y: maxY + d });
  all.push({ x: maxX + d, y: minY - d });

  let tris: number[][] = [[s0, s1, s2]];
  for (let i = 0; i < n; i++) {
    const p = all[i]!;
    const bad: number[][] = [];
    const keep: number[][] = [];
    for (const t of tris) {
      if (inCircumcircle(p, all[t[0]!]!, all[t[1]!]!, all[t[2]!]!)) bad.push(t);
      else keep.push(t);
    }
    const edgeCount = new Map<string, { edge: [number, number]; n: number }>();
    for (const t of bad) {
      const edges: [number, number][] = [
        [t[0]!, t[1]!],
        [t[1]!, t[2]!],
        [t[2]!, t[0]!],
      ];
      for (const [a, b] of edges) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const prev = edgeCount.get(key);
        if (prev) prev.n += 1;
        else edgeCount.set(key, { edge: [a, b], n: 1 });
      }
    }
    tris = keep;
    for (const { edge, n: count } of edgeCount.values()) {
      if (count !== 1) continue;
      tris.push([edge[0], edge[1], i]);
    }
  }
  return tris.filter((t) => t[0]! < n && t[1]! < n && t[2]! < n);
}

function inCircumcircle(p: XY, a: XY, b: XY, c: XY): boolean {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return false;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r2 = (a.x - ux) ** 2 + (a.y - uy) ** 2;
  const dist = (p.x - ux) ** 2 + (p.y - uy) ** 2;
  return dist < r2 - 1e-8;
}

export interface WarpCloud {
  /** Pixel positions, landmarks first, then frame anchors. */
  src: XY[];
  /** Landmark index for each src point, or -1 for an anchor. */
  map: number[];
  tris: number[][];
}

/** Control cloud for a photo. Triangles are computed once and reused while the slider moves. */
export function buildWarpCloud(
  landmarks: ReadonlyArray<{ x: number; y: number } | undefined>,
  w: number,
  h: number,
): WarpCloud | null {
  const src: XY[] = [];
  const map: number[] = [];
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    src.push({ x: p.x * w, y: p.y * h });
    map.push(i);
  }
  for (const a of frameAnchors(w, h)) {
    src.push(a);
    map.push(-1);
  }
  const tris = triangulate(src);
  if (tris.length === 0) return null;
  return { src, map, tris };
}

/** Slide each targeted landmark from the photo toward its ideal. Anchors stay put. */
export function destinationCloud(
  cloud: WarpCloud,
  targets: Record<number, XY>,
  t: number,
  w: number,
  h: number,
): XY[] {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return cloud.src.map((p, i) => {
    const li = cloud.map[i]!;
    const g = li >= 0 ? targets[li] : undefined;
    if (!g) return p;
    return { x: p.x + (g.x * w - p.x) * k, y: p.y + (g.y * h - p.y) * k };
  });
}

/**
 * Draw `image` warped from `cloud.src` to `dst` into a new canvas of the same size.
 * `maxEdge` caps the working resolution so the slider stays responsive.
 */
export function renderWarp(
  image: CanvasImageSource & { width: number; height: number },
  cloud: WarpCloud,
  dst: readonly XY[],
  maxEdge = 640,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const s = scale;
  ctx.drawImage(image, 0, 0, w, h);
  for (const t of cloud.tris) {
    const s0 = cloud.src[t[0]!]!;
    const s1 = cloud.src[t[1]!]!;
    const s2 = cloud.src[t[2]!]!;
    const d0 = dst[t[0]!]!;
    const d1 = dst[t[1]!]!;
    const d2 = dst[t[2]!]!;
    // A flipped destination mirrors the photo into a smear. Leave the original pixels.
    if (signedArea(s0, s1, s2) * signedArea(d0, d1, d2) <= 0) continue;
    const m = affine(
      { x: s0.x * s, y: s0.y * s },
      { x: s1.x * s, y: s1.y * s },
      { x: s2.x * s, y: s2.y * s },
      { x: d0.x * s, y: d0.y * s },
      { x: d1.x * s, y: d1.y * s },
      { x: d2.x * s, y: d2.y * s },
    );
    if (!m) continue;
    // Clip a hair wider than the triangle. Canvas antialiases the edge, and
    // the original photo underneath was showing through as a wireframe.
    const [c0, c1, c2] = padTriangle(
      { x: d0.x * s, y: d0.y * s },
      { x: d1.x * s, y: d1.y * s },
      { x: d2.x * s, y: d2.y * s },
      2,
    );
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(image, 0, 0, w, h);
    ctx.restore();
  }
  return canvas;
}

/** Push each corner out from the centroid so neighboring triangles overlap. */
export function padTriangle(a: XY, b: XY, c: XY, px: number): [XY, XY, XY] {
  const cx = (a.x + b.x + c.x) / 3;
  const cy = (a.y + b.y + c.y) / 3;
  const grow = (p: XY): XY => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return p;
    return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
  };
  return [grow(a), grow(b), grow(c)];
}

function signedArea(a: XY, b: XY, c: XY): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function affine(s0: XY, s1: XY, s2: XY, d0: XY, d1: XY, d2: XY): {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
} | null {
  const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(den) < 1e-6) return null;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    den;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    den;
  return { a, b, c, d, e, f };
}
