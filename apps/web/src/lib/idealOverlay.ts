import { isOpenLowBrow, LANDMARKS, TRICHION_K } from "@freeharmony/engine";
import type { MetricKey, MetricResult } from "@freeharmony/engine";

export type XY = { x: number; y: number };

const {
  TRICHION_PROXY,
  GLABELLA,
  SUBNASALE,
  LABIALE_SUP,
  STOMION_SUP,
  STOMION_INF,
  LABIALE_INF,
  SUBLABIALE,
  MENTON,
  R_CANTHUS_LAT,
  R_CANTHUS_MED,
  L_CANTHUS_MED,
  L_CANTHUS_LAT,
  R_LID_SUP,
  R_LID_INF,
  L_LID_SUP,
  L_LID_INF,
  R_IRIS_C,
  L_IRIS_C,
  R_ZYGION,
  L_ZYGION,
  R_TEMPLE,
  L_TEMPLE,
  R_GONION,
  L_GONION,
  R_RAMUS,
  L_RAMUS,
  R_ALARE,
  L_ALARE,
  R_CHEILION,
  L_CHEILION,
  R_BROW_INF,
  L_BROW_INF,
} = LANDMARKS;

function bandMid(m: MetricResult): number {
  return (m.band.lo + m.band.hi) / 2;
}

function at(
  pts: ReadonlyArray<{ x: number; y: number } | undefined>,
  i: number,
): XY | null {
  const p = pts[i];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}

function pupil(
  pts: ReadonlyArray<{ x: number; y: number } | undefined>,
  side: "R" | "L",
): XY | null {
  if (side === "R") {
    return at(pts, R_IRIS_C) ?? midpoint(at(pts, R_CANTHUS_LAT), at(pts, R_CANTHUS_MED));
  }
  return at(pts, L_IRIS_C) ?? midpoint(at(pts, L_CANTHUS_MED), at(pts, L_CANTHUS_LAT));
}

function midpoint(a: XY | null, b: XY | null): XY | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function ipdIso(
  pts: ReadonlyArray<{ x: number; y: number } | undefined>,
  aspect: number,
): number | null {
  const r = pupil(pts, "R");
  const l = pupil(pts, "L");
  if (!r || !l) return null;
  return Math.hypot((l.x - r.x) * aspect, l.y - r.y);
}

function moved(from: XY, to: XY, aspect: number): boolean {
  return Math.hypot((to.x - from.x) * aspect, to.y - from.y) > 0.006;
}

function put(
  out: Record<number, XY>,
  i: number,
  from: XY | null,
  to: XY | null,
  aspect: number,
) {
  if (!from || !to || !moved(from, to, aspect)) return;
  out[i] = to;
}

function angleAt(v: XY, a: XY, b: XY, aspect: number): number {
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

/** Place gonion so ramus–gonion–menton matches `targetDeg`, along the current outward ray. */
function gonionAtAngle(ramus: XY, gonion: XY, menton: XY, targetDeg: number, aspect: number): XY {
  const mid = { x: (ramus.x + menton.x) / 2, y: (ramus.y + menton.y) / 2 };
  const dir = { x: gonion.x - mid.x, y: gonion.y - mid.y };
  if (Math.hypot(dir.x * aspect, dir.y) < 1e-6) return gonion;
  let lo = 0.2;
  let hi = 4;
  for (let i = 0; i < 18; i++) {
    const t = (lo + hi) / 2;
    const g = { x: mid.x + dir.x * t, y: mid.y + dir.y * t };
    const ang = angleAt(g, ramus, menton, aspect);
    if (ang > targetDeg) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return { x: mid.x + dir.x * t, y: mid.y + dir.y * t };
}

/**
 * Image-normalized positions that would put `metric` at the middle of its
 * ideal band, moving only the landmarks that metric actually reads. Anchors
 * stay put so the ghost is a "this point should sit here" overlay.
 */
export function idealPointsForMetric(
  key: MetricKey,
  landmarks: ReadonlyArray<{ x: number; y: number } | undefined>,
  metric: MetricResult,
  aspect: number,
): Record<number, XY> {
  if (!(aspect > 0) || metric.score >= 100) return {};
  if (isOpenLowBrow(metric.key, metric.value, metric.band)) return {};
  const target = bandMid(metric);
  const out: Record<number, XY> = {};

  switch (key) {
    case "canthalTilt": {
      const rad = (target * Math.PI) / 180;
      const place = (med: XY | null, lat: XY | null) => {
        if (!med || !lat) return null;
        const dx = (lat.x - med.x) * aspect;
        return { x: lat.x, y: med.y - Math.tan(rad) * dx };
      };
      const rMed = at(landmarks, R_CANTHUS_MED);
      const rLat = at(landmarks, R_CANTHUS_LAT);
      const lMed = at(landmarks, L_CANTHUS_MED);
      const lLat = at(landmarks, L_CANTHUS_LAT);
      put(out, R_CANTHUS_LAT, rLat, place(rMed, rLat), aspect);
      put(out, L_CANTHUS_LAT, lLat, place(lMed, lLat), aspect);
      break;
    }
    case "eyeSeparationRatio": {
      const r = pupil(landmarks, "R");
      const l = pupil(landmarks, "L");
      const rz = at(landmarks, R_ZYGION);
      const lz = at(landmarks, L_ZYGION);
      if (!r || !l || !rz || !lz) break;
      const zygIso = Math.abs(lz.x - rz.x) * aspect;
      const cur = Math.hypot((l.x - r.x) * aspect, l.y - r.y);
      if (zygIso < 1e-6 || cur < 1e-6) break;
      const scale = (target * zygIso) / cur;
      const c = { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 };
      const r2 = { x: c.x + (r.x - c.x) * scale, y: c.y + (r.y - c.y) * scale };
      const l2 = { x: c.x + (l.x - c.x) * scale, y: c.y + (l.y - c.y) * scale };
      if (at(landmarks, R_IRIS_C)) put(out, R_IRIS_C, r, r2, aspect);
      else {
        put(out, R_CANTHUS_LAT, at(landmarks, R_CANTHUS_LAT), {
          x: (at(landmarks, R_CANTHUS_LAT)?.x ?? r.x) + (r2.x - r.x),
          y: (at(landmarks, R_CANTHUS_LAT)?.y ?? r.y) + (r2.y - r.y),
        }, aspect);
        put(out, R_CANTHUS_MED, at(landmarks, R_CANTHUS_MED), {
          x: (at(landmarks, R_CANTHUS_MED)?.x ?? r.x) + (r2.x - r.x),
          y: (at(landmarks, R_CANTHUS_MED)?.y ?? r.y) + (r2.y - r.y),
        }, aspect);
      }
      if (at(landmarks, L_IRIS_C)) put(out, L_IRIS_C, l, l2, aspect);
      else {
        put(out, L_CANTHUS_LAT, at(landmarks, L_CANTHUS_LAT), {
          x: (at(landmarks, L_CANTHUS_LAT)?.x ?? l.x) + (l2.x - l.x),
          y: (at(landmarks, L_CANTHUS_LAT)?.y ?? l.y) + (l2.y - l.y),
        }, aspect);
        put(out, L_CANTHUS_MED, at(landmarks, L_CANTHUS_MED), {
          x: (at(landmarks, L_CANTHUS_MED)?.x ?? l.x) + (l2.x - l.x),
          y: (at(landmarks, L_CANTHUS_MED)?.y ?? l.y) + (l2.y - l.y),
        }, aspect);
      }
      break;
    }
    case "eyeSymmetry": {
      const rLat = at(landmarks, R_CANTHUS_LAT);
      const rMed = at(landmarks, R_CANTHUS_MED);
      const lMed = at(landmarks, L_CANTHUS_MED);
      const lLat = at(landmarks, L_CANTHUS_LAT);
      if (!rLat || !rMed || !lMed || !lLat) break;
      const wR = Math.abs(rLat.x - rMed.x);
      const wL = Math.abs(lLat.x - lMed.x);
      const midX = (rMed.x + lMed.x) / 2;
      const flip = (p: XY): XY => ({ x: 2 * midX - p.x, y: p.y });
      const rightBetter = wR >= wL;
      if (rightBetter) {
        put(out, L_CANTHUS_LAT, lLat, flip(rLat), aspect);
        put(out, L_CANTHUS_MED, lMed, flip(rMed), aspect);
        put(out, L_LID_SUP, at(landmarks, L_LID_SUP), flip(at(landmarks, R_LID_SUP) ?? rMed), aspect);
        put(out, L_LID_INF, at(landmarks, L_LID_INF), flip(at(landmarks, R_LID_INF) ?? rMed), aspect);
      } else {
        put(out, R_CANTHUS_LAT, rLat, flip(lLat), aspect);
        put(out, R_CANTHUS_MED, rMed, flip(lMed), aspect);
        put(out, R_LID_SUP, at(landmarks, R_LID_SUP), flip(at(landmarks, L_LID_SUP) ?? lMed), aspect);
        put(out, R_LID_INF, at(landmarks, R_LID_INF), flip(at(landmarks, L_LID_INF) ?? lMed), aspect);
      }
      break;
    }
    case "facialThirds": {
      // Same construction as the engine: trichion is extrapolated above
      // mesh-top, then thirds are hairline → glabella → subnasale → menton.
      // Do not equal-split mesh-top → chin — that is not the midface.
      const p = at(landmarks, TRICHION_PROXY);
      const g = at(landmarks, GLABELLA);
      const s = at(landmarks, SUBNASALE);
      const m = at(landmarks, MENTON);
      if (!p || !g || !s || !m) break;
      const t = {
        x: p.x,
        y: (1 - TRICHION_K) * g.y + TRICHION_K * p.y,
      };
      const span = m.y - t.y;
      if (span < 1e-6) break;
      put(out, TRICHION_PROXY, p, t, aspect);
      put(out, GLABELLA, g, { x: g.x, y: t.y + span / 3 }, aspect);
      put(out, SUBNASALE, s, { x: s.x, y: t.y + (2 * span) / 3 }, aspect);
      break;
    }
    case "midLowerThird": {
      const g = at(landmarks, GLABELLA);
      const s = at(landmarks, SUBNASALE);
      const m = at(landmarks, MENTON);
      if (!g || !s || !m) break;
      const total = m.y - g.y;
      const lower = total / (target + 1);
      put(out, SUBNASALE, s, { x: s.x, y: m.y - lower }, aspect);
      break;
    }
    case "facialFifths": {
      const rt = at(landmarks, R_TEMPLE);
      const rLat = at(landmarks, R_CANTHUS_LAT);
      const lLat = at(landmarks, L_CANTHUS_LAT);
      const lt = at(landmarks, L_TEMPLE);
      if (!rt || !rLat || !lLat || !lt) break;
      const inner = Math.abs(lLat.x - rLat.x) / 3;
      put(out, R_TEMPLE, rt, { x: rLat.x - inner, y: rt.y }, aspect);
      put(out, L_TEMPLE, lt, { x: lLat.x + inner, y: lt.y }, aspect);
      break;
    }
    case "midfaceRatio": {
      const r = pupil(landmarks, "R");
      const l = pupil(landmarks, "L");
      const lip = at(landmarks, LABIALE_SUP);
      const ipd = ipdIso(landmarks, aspect);
      if (!r || !l || !lip || ipd === null || ipd < 1e-6) break;
      const pupilY = (r.y + l.y) / 2;
      put(out, LABIALE_SUP, lip, { x: lip.x, y: pupilY + target * ipd }, aspect);
      break;
    }
    case "fwhr": {
      const rz = at(landmarks, R_ZYGION);
      const lz = at(landmarks, L_ZYGION);
      const lid = at(landmarks, R_LID_SUP);
      const lip = at(landmarks, LABIALE_SUP);
      if (!rz || !lz || !lid || !lip) break;
      const height = Math.abs(lip.y - lid.y);
      if (height < 1e-6) break;
      const zygW = (target * height) / aspect;
      const cx = (rz.x + lz.x) / 2;
      put(out, R_ZYGION, rz, { x: cx - zygW / 2, y: rz.y }, aspect);
      put(out, L_ZYGION, lz, { x: cx + zygW / 2, y: lz.y }, aspect);
      break;
    }
    case "jawToCheekbone": {
      const rz = at(landmarks, R_ZYGION);
      const lz = at(landmarks, L_ZYGION);
      const rg = at(landmarks, R_GONION);
      const lg = at(landmarks, L_GONION);
      if (!rz || !lz || !rg || !lg) break;
      const zygW = Math.abs(lz.x - rz.x);
      const jawW = target * zygW;
      const cx = (rg.x + lg.x) / 2;
      put(out, R_GONION, rg, { x: cx - jawW / 2, y: rg.y }, aspect);
      put(out, L_GONION, lg, { x: cx + jawW / 2, y: lg.y }, aspect);
      break;
    }
    case "chinToPhiltrum": {
      const sn = at(landmarks, SUBNASALE);
      const ls = at(landmarks, LABIALE_SUP);
      const sl = at(landmarks, SUBLABIALE);
      const me = at(landmarks, MENTON);
      if (!sn || !ls || !sl || !me) break;
      const philtrum = ls.y - sn.y;
      if (philtrum < 1e-6) break;
      put(out, MENTON, me, { x: me.x, y: sl.y + target * philtrum }, aspect);
      break;
    }
    case "lipRatio": {
      const us = at(landmarks, LABIALE_SUP);
      const ss = at(landmarks, STOMION_SUP);
      const si = at(landmarks, STOMION_INF);
      const li = at(landmarks, LABIALE_INF);
      if (!us || !ss || !si || !li) break;
      const upper = ss.y - us.y;
      if (upper < 1e-6) break;
      put(out, LABIALE_INF, li, { x: li.x, y: si.y + target * upper }, aspect);
      break;
    }
    case "mouthToNoseWidth": {
      const rc = at(landmarks, R_CHEILION);
      const lc = at(landmarks, L_CHEILION);
      const ra = at(landmarks, R_ALARE);
      const la = at(landmarks, L_ALARE);
      if (!rc || !lc || !ra || !la) break;
      const nose = Math.abs(la.x - ra.x);
      const mouth = target * nose;
      const cx = (rc.x + lc.x) / 2;
      put(out, R_CHEILION, rc, { x: cx - mouth / 2, y: rc.y }, aspect);
      put(out, L_CHEILION, lc, { x: cx + mouth / 2, y: lc.y }, aspect);
      break;
    }
    case "eyeToMouthAngle": {
      const r = pupil(landmarks, "R");
      const l = pupil(landmarks, "L");
      const st = at(landmarks, STOMION_SUP);
      const ipd = ipdIso(landmarks, aspect);
      if (!r || !l || !st || ipd === null || ipd < 1e-6) break;
      const pupilY = (r.y + l.y) / 2;
      const half = ((target / 2) * Math.PI) / 180;
      const tan = Math.tan(half);
      if (Math.abs(tan) < 1e-6) break;
      put(out, STOMION_SUP, st, { x: st.x, y: pupilY + ipd / 2 / tan }, aspect);
      break;
    }
    case "jawAngularity": {
      const rr = at(landmarks, R_RAMUS);
      const rg = at(landmarks, R_GONION);
      const lr = at(landmarks, L_RAMUS);
      const lg = at(landmarks, L_GONION);
      const me = at(landmarks, MENTON);
      if (!rr || !rg || !lr || !lg || !me) break;
      put(out, R_GONION, rg, gonionAtAngle(rr, rg, me, target, aspect), aspect);
      put(out, L_GONION, lg, gonionAtAngle(lr, lg, me, target, aspect), aspect);
      break;
    }
    case "browPosition": {
      const ipd = ipdIso(landmarks, aspect);
      const rLid = at(landmarks, R_LID_SUP);
      const lLid = at(landmarks, L_LID_SUP);
      if (ipd === null || !rLid || !lLid) break;
      const gap = target * ipd;
      for (const i of R_BROW_INF) {
        const p = at(landmarks, i);
        put(out, i, p, p ? { x: p.x, y: rLid.y - gap } : null, aspect);
      }
      for (const i of L_BROW_INF) {
        const p = at(landmarks, i);
        put(out, i, p, p ? { x: p.x, y: lLid.y - gap } : null, aspect);
      }
      break;
    }
    default:
      break;
  }
  return out;
}
