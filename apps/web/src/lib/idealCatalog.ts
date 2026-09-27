import { LANDMARKS, TRICHION_K } from "@freeharmony/engine";
import type { MetricKey, MetricResult } from "@freeharmony/engine";

type XY = { x: number; y: number };

const {
  TRICHION_PROXY,
  GLABELLA,
  PRONASALE,
  SUBNASALE,
  LABIALE_SUP,
  STOMION_SUP,
  LABIALE_INF,
  MENTON,
  R_CANTHUS_LAT,
  R_CANTHUS_MED,
  L_CANTHUS_MED,
  L_CANTHUS_LAT,
  R_LID_SUP,
  R_LID_INF,
  L_LID_SUP,
  L_LID_INF,
  R_ZYGION,
  L_ZYGION,
  R_TEMPLE,
  L_TEMPLE,
  R_GONION,
  L_GONION,
  R_ALARE,
  L_ALARE,
  R_CHEILION,
  L_CHEILION,
  R_TRAGION,
  L_TRAGION,
  R_NOSE_BRIDGE,
  L_NOSE_BRIDGE,
  R_CUPID,
  L_CUPID,
  R_BROW_SUP,
  L_BROW_SUP,
  R_BROW_INF,
  L_BROW_INF,
  R_BROW_PEAK,
  L_BROW_PEAK,
  SYM_PAIRS,
  JAW_SYM_PAIRS,
} = LANDMARKS;

type Cloud = ReadonlyArray<{ x: number; y: number } | undefined>;

function at(pts: Cloud, i: number): XY | null {
  const p = pts[i];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}

function moved(from: XY, to: XY, aspect: number): boolean {
  return Math.hypot((to.x - from.x) * aspect, to.y - from.y) > 0.004;
}

function put(out: Record<number, XY>, i: number, from: XY | null, to: XY | null, aspect: number) {
  if (!from || !to || !moved(from, to, aspect)) return;
  out[i] = to;
}

function width(a: XY, b: XY, aspect: number): number {
  return Math.abs(b.x - a.x) * aspect;
}

function angleDeg(v: XY, a: XY, b: XY, aspect: number): number {
  const ax = (a.x - v.x) * aspect;
  const ay = a.y - v.y;
  const bx = (b.x - v.x) * aspect;
  const by = b.y - v.y;
  const na = Math.hypot(ax, ay);
  const nb = Math.hypot(bx, by);
  if (na < 1e-9 || nb < 1e-9) return 0;
  const c = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (na * nb)));
  return (Math.acos(c) * 180) / Math.PI;
}

function pupilMid(pts: Cloud): XY | null {
  const r = at(pts, 468) ?? midpoint(at(pts, R_CANTHUS_LAT), at(pts, R_CANTHUS_MED));
  const l = at(pts, 473) ?? midpoint(at(pts, L_CANTHUS_MED), at(pts, L_CANTHUS_LAT));
  return midpoint(r, l);
}

function midpoint(a: XY | null, b: XY | null): XY | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function symmetrize(out: Record<number, XY>, pts: Cloud, pairs: ReadonlyArray<readonly [number, number, ...number[]]>, aspect: number) {
  const mid = pupilMid(pts);
  if (!mid) return;
  for (const [ri, li] of pairs) {
    const r = at(pts, ri);
    const l = at(pts, li);
    if (!r || !l) continue;
    const mirrorL = { x: 2 * mid.x - l.x, y: l.y };
    const rTo = { x: (r.x + mirrorL.x) / 2, y: (r.y + mirrorL.y) / 2 };
    const lTo = { x: 2 * mid.x - rTo.x, y: rTo.y };
    put(out, ri, r, rTo, aspect);
    put(out, li, l, lTo, aspect);
  }
}

function spreadX(
  out: Record<number, XY>,
  pts: Cloud,
  right: number,
  left: number,
  targetWidthIso: number,
  aspect: number,
) {
  const r = at(pts, right);
  const l = at(pts, left);
  if (!r || !l || !(aspect > 0)) return;
  const cx = (r.x + l.x) / 2;
  const half = targetWidthIso / aspect / 2;
  put(out, right, r, { x: cx - half, y: r.y }, aspect);
  put(out, left, l, { x: cx + half, y: l.y }, aspect);
}

/**
 * Landmark targets for the newer front measurements. Returns null when this
 * key is handled by the original overlay switch instead.
 */
export function catalogIdeal(
  key: MetricKey,
  pts: Cloud,
  metric: MetricResult,
  aspect: number,
): Record<number, XY> | null {
  const target = (metric.band.lo + metric.band.hi) / 2;
  const out: Record<number, XY> = {};
  const rz = at(pts, R_ZYGION);
  const lz = at(pts, L_ZYGION);

  switch (key) {
    case "totalFaceRatio": {
      const p = at(pts, TRICHION_PROXY);
      const g = at(pts, GLABELLA);
      const me = at(pts, MENTON);
      if (!p || !g || !me || !rz || !lz) break;
      const hairY = (1 - TRICHION_K) * g.y + TRICHION_K * p.y;
      const faceW = width(rz, lz, aspect);
      if (faceW < 1e-6) break;
      put(out, MENTON, me, { x: me.x, y: hairY + target * faceW }, aspect);
      break;
    }
    case "bitemporalWidth": {
      if (!rz || !lz) break;
      spreadX(out, pts, R_TEMPLE, L_TEMPLE, target * width(rz, lz, aspect), aspect);
      break;
    }
    case "cheekboneHeight": {
      const lip = at(pts, LABIALE_SUP);
      const mid = pupilMid(pts);
      if (!lip || !mid || !rz || !lz) break;
      const y = mid.y + target * (lip.y - mid.y);
      put(out, R_ZYGION, rz, { x: rz.x, y }, aspect);
      put(out, L_ZYGION, lz, { x: lz.x, y }, aspect);
      break;
    }
    case "eyeAspect": {
      const place = (lat: number, med: number, sup: number, inf: number) => {
        const a = at(pts, lat);
        const b = at(pts, med);
        const u = at(pts, sup);
        const d = at(pts, inf);
        if (!a || !b || !u || !d || target < 1e-3) return;
        const h = width(a, b, aspect) / target;
        put(out, inf, d, { x: d.x, y: u.y + h }, aspect);
      };
      place(R_CANTHUS_LAT, R_CANTHUS_MED, R_LID_SUP, R_LID_INF);
      place(L_CANTHUS_LAT, L_CANTHUS_MED, L_LID_SUP, L_LID_INF);
      break;
    }
    case "oneEyeApart": {
      const rLat = at(pts, R_CANTHUS_LAT);
      const rMed = at(pts, R_CANTHUS_MED);
      const lMed = at(pts, L_CANTHUS_MED);
      const lLat = at(pts, L_CANTHUS_LAT);
      if (!rLat || !rMed || !lMed || !lLat) break;
      const eye = (width(rLat, rMed, aspect) + width(lMed, lLat, aspect)) / 2;
      spreadX(out, pts, R_CANTHUS_MED, L_CANTHUS_MED, target * eye, aspect);
      break;
    }
    case "eyebrowTilt": {
      const lift = (medI: number, peakI: number) => {
        const med = at(pts, medI);
        const peak = at(pts, peakI);
        if (!med || !peak) return;
        const run = Math.abs(peak.x - med.x) * aspect;
        const rise = Math.tan((target * Math.PI) / 180) * run;
        put(out, peakI, peak, { x: peak.x, y: med.y - rise }, aspect);
      };
      lift(R_BROW_SUP[R_BROW_SUP.length - 1]!, R_BROW_PEAK);
      lift(L_BROW_SUP[L_BROW_SUP.length - 1]!, L_BROW_PEAK);
      break;
    }
    case "browLengthRatio": {
      if (!rz || !lz) break;
      const faceW = width(rz, lz, aspect);
      const chain = [...R_BROW_SUP, ...R_BROW_INF, ...L_BROW_SUP, ...L_BROW_INF];
      let minX = Infinity;
      let maxX = -Infinity;
      for (const i of chain) {
        const p = at(pts, i);
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      const cur = (maxX - minX) * aspect;
      if (!(cur > 1e-6) || !(faceW > 1e-6)) break;
      const scale = (target * faceW) / cur;
      const cx = (minX + maxX) / 2;
      for (const i of chain) {
        const p = at(pts, i);
        if (!p) continue;
        put(out, i, p, { x: cx + (p.x - cx) * scale, y: p.y }, aspect);
      }
      break;
    }
    case "nasalIntercanthal": {
      const rMed = at(pts, R_CANTHUS_MED);
      const lMed = at(pts, L_CANTHUS_MED);
      if (!rMed || !lMed) break;
      spreadX(out, pts, R_ALARE, L_ALARE, target * width(rMed, lMed, aspect), aspect);
      break;
    }
    case "noseBridgeRatio": {
      const ra = at(pts, R_ALARE);
      const la = at(pts, L_ALARE);
      if (!ra || !la || target < 1e-3) break;
      spreadX(out, pts, R_NOSE_BRIDGE, L_NOSE_BRIDGE, width(ra, la, aspect) / target, aspect);
      break;
    }
    case "eyeNoseAngle": {
      const sn = at(pts, SUBNASALE);
      const r = at(pts, R_CANTHUS_LAT);
      const l = at(pts, L_CANTHUS_LAT);
      if (!sn || !r || !l) break;
      const y = searchY(sn.y, (yy) => angleDeg({ x: sn.x, y: yy }, r, l, aspect), target);
      put(out, SUBNASALE, sn, { x: sn.x, y }, aspect);
      break;
    }
    case "jawFrontalAngle": {
      const me = at(pts, MENTON);
      const rg = at(pts, R_GONION);
      const lg = at(pts, L_GONION);
      if (!me || !rg || !lg) break;
      const y = searchY(me.y, (yy) => angleDeg({ x: me.x, y: yy }, rg, lg, aspect), target);
      put(out, MENTON, me, { x: me.x, y }, aspect);
      break;
    }
    case "cupidBowDepth": {
      const dip = at(pts, LABIALE_SUP);
      const rc = at(pts, R_CUPID);
      const lc = at(pts, L_CUPID);
      const rr = at(pts, R_CHEILION);
      const ll = at(pts, L_CHEILION);
      if (!dip || !rc || !lc || !rr || !ll) break;
      const y = dip.y - target * width(rr, ll, aspect);
      put(out, R_CUPID, rc, { x: rc.x, y }, aspect);
      put(out, L_CUPID, lc, { x: lc.x, y }, aspect);
      break;
    }
    case "mouthToEyeWidth": {
      const mid = pupilMid(pts);
      const r = at(pts, 468) ?? at(pts, R_CANTHUS_LAT);
      const l = at(pts, 473) ?? at(pts, L_CANTHUS_LAT);
      if (!mid || !r || !l) break;
      const ipd = Math.hypot((l.x - r.x) * aspect, l.y - r.y);
      spreadX(out, pts, R_CHEILION, L_CHEILION, target * ipd, aspect);
      break;
    }
    case "mouthCornerHeight": {
      const seam = at(pts, STOMION_SUP);
      const rc = at(pts, R_CHEILION);
      const lc = at(pts, L_CHEILION);
      if (!seam || !rc || !lc) break;
      const half = width(rc, lc, aspect) / 2;
      const lift = Math.tan((target * Math.PI) / 180) * half;
      const y = seam.y - lift;
      put(out, R_CHEILION, rc, { x: rc.x, y }, aspect);
      put(out, L_CHEILION, lc, { x: lc.x, y }, aspect);
      break;
    }
    case "jawSlope": {
      const me = at(pts, MENTON);
      const place = (i: number) => {
        const g = at(pts, i);
        if (!g || !me) return;
        const rise = Math.abs(me.y - g.y);
        const run = Math.tan((target * Math.PI) / 180) * rise;
        const sign = g.x < me.x ? -1 : 1;
        put(out, i, g, { x: me.x + (sign * run) / aspect, y: g.y }, aspect);
      };
      place(R_GONION);
      place(L_GONION);
      break;
    }
    case "earProtrusion": {
      if (!rz || !lz) break;
      const faceW = Math.abs(lz.x - rz.x);
      const amount = target * faceW;
      const rt = at(pts, R_TRAGION);
      const lt = at(pts, L_TRAGION);
      put(out, R_TRAGION, rt, rt ? { x: rz.x - amount, y: rt.y } : null, aspect);
      put(out, L_TRAGION, lt, lt ? { x: lz.x + amount, y: lt.y } : null, aspect);
      break;
    }
    case "lipFullness": {
      const sn = at(pts, SUBNASALE);
      const me = at(pts, MENTON);
      const us = at(pts, LABIALE_SUP);
      const ss = at(pts, STOMION_SUP);
      const li = at(pts, LABIALE_INF);
      if (!sn || !me || !us || !ss || !li) break;
      const third = me.y - sn.y;
      const upper = ss.y - us.y;
      const lower = li.y - ss.y;
      const sum = upper + lower;
      if (third < 1e-6 || sum < 1e-6) break;
      const scale = (target * third) / sum;
      put(out, LABIALE_SUP, us, { x: us.x, y: ss.y - upper * scale }, aspect);
      put(out, LABIALE_INF, li, { x: li.x, y: ss.y + lower * scale }, aspect);
      break;
    }
    case "cheekProminence": {
      if (!rz || !lz) break;
      spreadX(out, pts, R_GONION, L_GONION, width(rz, lz, aspect) * (1 - target), aspect);
      break;
    }
    case "chinDefinition": {
      const me = at(pts, MENTON);
      const a = at(pts, 176);
      const b = at(pts, 400);
      if (!me || !a || !b) break;
      const scale = searchScale(1, (s) => {
        const aa = { x: me.x + (a.x - me.x) * s, y: me.y + (a.y - me.y) * s };
        const bb = { x: me.x + (b.x - me.x) * s, y: me.y + (b.y - me.y) * s };
        return angleDeg(me, aa, bb, aspect);
      }, target);
      put(out, 176, a, { x: me.x + (a.x - me.x) * scale, y: me.y + (a.y - me.y) * scale }, aspect);
      put(out, 400, b, { x: me.x + (b.x - me.x) * scale, y: me.y + (b.y - me.y) * scale }, aspect);
      break;
    }
    case "overallSymmetry":
      symmetrize(out, pts, SYM_PAIRS, aspect);
      break;
    case "jawSymmetry":
      symmetrize(out, pts, JAW_SYM_PAIRS, aspect);
      break;
    case "noseSymmetry":
      symmetrize(out, pts, [[R_ALARE, L_ALARE], [R_NOSE_BRIDGE, L_NOSE_BRIDGE]], aspect);
      break;
    case "mouthSymmetry":
      symmetrize(out, pts, [[R_CHEILION, L_CHEILION]], aspect);
      break;
    case "browSymmetry":
      symmetrize(out, pts, [[R_BROW_PEAK, L_BROW_PEAK]], aspect);
      break;
    case "cheekSymmetry":
      symmetrize(out, pts, [[R_ZYGION, L_ZYGION]], aspect);
      break;
    case "earSymmetry":
      symmetrize(out, pts, [[R_TRAGION, L_TRAGION]], aspect);
      break;
    case "templeSymmetry":
      symmetrize(out, pts, [[R_TEMPLE, L_TEMPLE]], aspect);
      break;
    case "verticalSymmetry": {
      const g = at(pts, GLABELLA);
      const m = at(pts, MENTON);
      if (!g || !m) break;
      const xAt = (y: number) => g.x + ((y - g.y) / ((m.y - g.y) || 1)) * (m.x - g.x);
      for (const i of [PRONASALE, SUBNASALE]) {
        const p = at(pts, i);
        if (!p) continue;
        put(out, i, p, { x: xAt(p.y), y: p.y }, aspect);
      }
      break;
    }
    default:
      return null;
  }
  return out;
}

function searchY(start: number, measure: (y: number) => number, target: number): number {
  let best = start;
  let err = Infinity;
  for (let i = 0; i <= 28; i++) {
    const y = start - 0.18 + (0.36 * i) / 28;
    const e = Math.abs(measure(y) - target);
    if (e < err) {
      err = e;
      best = y;
    }
  }
  return best;
}

function searchScale(start: number, measure: (s: number) => number, target: number): number {
  let best = start;
  let err = Infinity;
  for (let i = 0; i <= 20; i++) {
    const s = 0.6 + (0.8 * i) / 20;
    const e = Math.abs(measure(s) - target);
    if (e < err) {
      err = e;
      best = s;
    }
  }
  return best;
}
