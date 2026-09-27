import type { Frame, MetricComputation, MetricDef, Pt } from "../types";
import { angleAt, dx, dy, pt, pupils } from "../landmarks/accessors";
import {
  GLABELLA,
  L_ALARE,
  L_BROW_INF,
  L_BROW_PEAK,
  L_BROW_SUP,
  L_CANTHUS_LAT,
  L_CANTHUS_MED,
  L_CHEILION,
  L_CUPID,
  L_GONION,
  L_LID_INF,
  L_LID_SUP,
  L_NOSE_BRIDGE,
  L_TEMPLE,
  L_TRAGION,
  L_ZYGION,
  LABIALE_INF,
  LABIALE_SUP,
  MENTON,
  PRONASALE,
  R_ALARE,
  R_BROW_INF,
  R_BROW_PEAK,
  R_BROW_SUP,
  R_CANTHUS_LAT,
  R_CANTHUS_MED,
  R_CHEILION,
  R_CUPID,
  R_GONION,
  R_LID_INF,
  R_LID_SUP,
  R_NOSE_BRIDGE,
  R_TEMPLE,
  R_TRAGION,
  R_ZYGION,
  STOMION_SUP,
  SUBNASALE,
  TRICHION_PROXY,
} from "../landmarks/indices";
import { BANDS } from "../scoring/bands";

const RAD2DEG = 180 / Math.PI;
/** Keep in step with TRICHION_K in registry.ts. */
const TRICHION_K = 1.8;

function ok(
  value: number,
  confidence = 1,
  flags?: string[],
  detail?: Record<string, number | number[]>,
): MetricComputation {
  return { value, confidence, flags, detail };
}

function finite(v: number): boolean {
  return Number.isFinite(v);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function pairBalance(f: Frame, a: number, b: number): number {
  const midX = (pupils(f).right.x + pupils(f).left.x) / 2;
  const pa = pt(f, a);
  const pb = pt(f, b);
  const da = Math.abs(pa.x - midX);
  const db = Math.abs(pb.x - midX);
  const width = Math.min(da, db) / Math.max(da, db, 1e-6);
  const level = clamp01(1 - Math.abs(pa.y - pb.y) / (0.08 * f.scale));
  return ((width + level) / 2) * 100;
}

function browSpan(f: Frame, chain: readonly number[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const i of chain) {
    const x = pt(f, i).x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return maxX - minX;
}

function archDeg(f: Frame, medial: number, peak: number): number {
  const run = Math.abs(pt(f, peak).x - pt(f, medial).x);
  const rise = pt(f, peak).y - pt(f, medial).y;
  if (run < 1e-6) return 0;
  return Math.atan2(rise, run) * RAD2DEG;
}

function slopeFromVertical(f: Frame, top: number, bottom: number): number {
  const run = Math.abs(pt(f, top).x - pt(f, bottom).x);
  const rise = pt(f, top).y - pt(f, bottom).y;
  if (rise <= 1e-6) return 90;
  return Math.atan2(run, rise) * RAD2DEG;
}

function totalFaceRatio(f: Frame): MetricComputation | null {
  const yG = pt(f, GLABELLA).y;
  const yT = yG + TRICHION_K * (pt(f, TRICHION_PROXY).y - yG);
  const height = yT - pt(f, MENTON).y;
  const width = dx(f, R_ZYGION, L_ZYGION);
  if (width < 1e-6) return null;
  const value = height / width;
  return finite(value) ? ok(value) : null;
}

function bitemporalWidth(f: Frame): MetricComputation | null {
  const zyg = dx(f, R_ZYGION, L_ZYGION);
  if (zyg < 1e-6) return null;
  return ok(dx(f, R_TEMPLE, L_TEMPLE) / zyg);
}

function cheekboneHeight(f: Frame): MetricComputation | null {
  const { right, left } = pupils(f);
  const pupilY = (right.y + left.y) / 2;
  const lipY = pt(f, LABIALE_SUP).y;
  const span = pupilY - lipY;
  if (Math.abs(span) < 1e-6) return null;
  const zygY = (pt(f, R_ZYGION).y + pt(f, L_ZYGION).y) / 2;
  return ok((pupilY - zygY) / span);
}

function eyeAspect(f: Frame): MetricComputation | null {
  const wR = dx(f, R_CANTHUS_LAT, R_CANTHUS_MED);
  const wL = dx(f, L_CANTHUS_MED, L_CANTHUS_LAT);
  const hR = Math.abs(dy(f, R_LID_SUP, R_LID_INF));
  const hL = Math.abs(dy(f, L_LID_SUP, L_LID_INF));
  if (hR < 1e-6 || hL < 1e-6) return null;
  return ok((wR / hR + wL / hL) / 2);
}

function oneEyeApart(f: Frame): MetricComputation | null {
  const gap = dx(f, R_CANTHUS_MED, L_CANTHUS_MED);
  const wR = dx(f, R_CANTHUS_LAT, R_CANTHUS_MED);
  const wL = dx(f, L_CANTHUS_MED, L_CANTHUS_LAT);
  const eye = (wR + wL) / 2;
  if (eye < 1e-6) return null;
  return ok(gap / eye);
}

function eyebrowTilt(f: Frame): MetricComputation {
  const rMed = R_BROW_SUP[R_BROW_SUP.length - 1]!;
  const lMed = L_BROW_SUP[L_BROW_SUP.length - 1]!;
  return ok((archDeg(f, rMed, R_BROW_PEAK) + archDeg(f, lMed, L_BROW_PEAK)) / 2);
}

function browLengthRatio(f: Frame): MetricComputation | null {
  const width = dx(f, R_ZYGION, L_ZYGION);
  if (width < 1e-6) return null;
  const span =
    browSpan(f, [...R_BROW_SUP, ...R_BROW_INF]) +
    browSpan(f, [...L_BROW_SUP, ...L_BROW_INF]);
  return ok(span / width);
}

function nasalIntercanthal(f: Frame): MetricComputation | null {
  const gap = dx(f, R_CANTHUS_MED, L_CANTHUS_MED);
  if (gap < 1e-6) return null;
  return ok(dx(f, R_ALARE, L_ALARE) / gap);
}

function noseBridgeRatio(f: Frame): MetricComputation | null {
  const bridge = dx(f, R_NOSE_BRIDGE, L_NOSE_BRIDGE);
  if (bridge < 1e-6) return null;
  return ok(dx(f, R_ALARE, L_ALARE) / bridge);
}

function eyeNoseAngle(f: Frame): MetricComputation {
  return ok(angleAt(f, SUBNASALE, R_CANTHUS_LAT, L_CANTHUS_LAT));
}

function jawFrontalAngle(f: Frame): MetricComputation {
  return ok(angleAt(f, MENTON, R_GONION, L_GONION));
}

function midfaceJawAlign(f: Frame): MetricComputation {
  return ok(
    Math.abs(
      angleAt(f, SUBNASALE, R_CANTHUS_LAT, L_CANTHUS_LAT) -
        angleAt(f, MENTON, R_GONION, L_GONION),
    ),
  );
}

function cupidBowDepth(f: Frame): MetricComputation | null {
  const mouth = dx(f, R_CHEILION, L_CHEILION);
  if (mouth < 1e-6) return null;
  const peaks = (pt(f, R_CUPID).y + pt(f, L_CUPID).y) / 2;
  return ok((peaks - pt(f, LABIALE_SUP).y) / mouth);
}

function mouthToEyeWidth(f: Frame): MetricComputation | null {
  const { right, left } = pupils(f);
  const ipd = Math.sqrt((right.x - left.x) ** 2 + (right.y - left.y) ** 2);
  if (ipd < 1e-6) return null;
  return ok(dx(f, R_CHEILION, L_CHEILION) / ipd);
}

function mouthCornerHeight(f: Frame): MetricComputation | null {
  const half = dx(f, R_CHEILION, L_CHEILION) / 2;
  if (half < 1e-6) return null;
  const seam = pt(f, STOMION_SUP).y;
  const lift =
    ((pt(f, R_CHEILION).y - seam) + (pt(f, L_CHEILION).y - seam)) / 2;
  return ok(Math.atan2(lift, half) * RAD2DEG);
}

function jawSlope(f: Frame): MetricComputation {
  return ok(
    (slopeFromVertical(f, R_GONION, MENTON) + slopeFromVertical(f, L_GONION, MENTON)) /
      2,
  );
}

function earProtrusion(f: Frame): MetricComputation | null {
  const width = dx(f, R_ZYGION, L_ZYGION);
  if (width < 1e-6) return null;
  // Mesh "tragion" is pre-auricular, so this is a proxy, not a true helix.
  const right = pt(f, R_ZYGION).x - pt(f, R_TRAGION).x;
  const left = pt(f, L_TRAGION).x - pt(f, L_ZYGION).x;
  return ok(Math.max(0, (right + left) / 2) / width, 0.65, ["ear-proxy"]);
}

function lipFullness(f: Frame): MetricComputation | null {
  const lowerThird = pt(f, SUBNASALE).y - pt(f, MENTON).y;
  if (lowerThird < 1e-6) return null;
  const upper = Math.abs(dy(f, LABIALE_SUP, STOMION_SUP));
  const lower = Math.abs(pt(f, STOMION_SUP).y - pt(f, LABIALE_INF).y);
  return ok((upper + lower) / lowerThird);
}

function cheekProminence(f: Frame): MetricComputation | null {
  const zyg = dx(f, R_ZYGION, L_ZYGION);
  if (zyg < 1e-6) return null;
  return ok((zyg - dx(f, R_GONION, L_GONION)) / zyg);
}

function chinDefinition(f: Frame): MetricComputation {
  return ok(angleAt(f, MENTON, 176, 400));
}

function verticalSymmetry(f: Frame): MetricComputation {
  const g = pt(f, GLABELLA);
  const m = pt(f, MENTON);
  const span = g.y - m.y;
  const xAt = (y: number) => g.x + ((g.y - y) / (span || 1)) * (m.x - g.x);
  const tol = 0.045 * f.scale;
  const dev = (p: Pt) => Math.abs(p.x - xAt(p.y));
  const score =
    (clamp01(1 - dev(pt(f, PRONASALE)) / tol) +
      clamp01(1 - dev(pt(f, SUBNASALE)) / tol)) /
    2;
  return ok(score * 100);
}

function blankOverlay(points: number[]): MetricDef["overlay"] {
  return { points, polylines: [] };
}

export const FRONT_CATALOG: MetricDef[] = [
  {
    key: "totalFaceRatio",
    label: "Full face height to width",
    unit: "ratio",
    area: "midface",
    weight: 0.04,
    dimorphic: false,
    bands: BANDS.totalFaceRatio,
    region: "jaw",
    vertical: true,
    overlay: blankOverlay([10, 152, R_ZYGION, L_ZYGION]),
    compute: (f) => totalFaceRatio(f),
  },
  {
    key: "bitemporalWidth",
    label: "Temple to cheekbone width",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.bitemporalWidth,
    region: "jaw",
    overlay: blankOverlay([R_TEMPLE, L_TEMPLE, R_ZYGION, L_ZYGION]),
    compute: (f) => bitemporalWidth(f),
  },
  {
    key: "cheekboneHeight",
    label: "Cheekbone height",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.cheekboneHeight,
    region: "jaw",
    vertical: true,
    overlay: blankOverlay([R_ZYGION, L_ZYGION, LABIALE_SUP]),
    compute: (f) => cheekboneHeight(f),
  },
  {
    key: "eyeAspect",
    label: "Eye shape",
    unit: "ratio",
    area: "eyeArea",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.eyeAspect,
    region: "eyes",
    overlay: blankOverlay([R_CANTHUS_LAT, R_CANTHUS_MED, R_LID_SUP, R_LID_INF, L_CANTHUS_LAT, L_CANTHUS_MED, L_LID_SUP, L_LID_INF]),
    compute: (f) => eyeAspect(f),
  },
  {
    key: "oneEyeApart",
    label: "One-eye gap",
    unit: "ratio",
    area: "eyeArea",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.oneEyeApart,
    region: "eyes",
    overlay: blankOverlay([R_CANTHUS_MED, L_CANTHUS_MED, R_CANTHUS_LAT, L_CANTHUS_LAT]),
    compute: (f) => oneEyeApart(f),
  },
  {
    key: "eyebrowTilt",
    label: "Eyebrow arch",
    unit: "deg",
    area: "eyeArea",
    weight: 0.03,
    dimorphic: true,
    bands: BANDS.eyebrowTilt,
    region: "brow",
    overlay: blankOverlay([R_BROW_PEAK, L_BROW_PEAK, 107, 336]),
    compute: (f) => eyebrowTilt(f),
  },
  {
    key: "browLengthRatio",
    label: "Brow length",
    unit: "ratio",
    area: "eyeArea",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.browLengthRatio,
    region: "brow",
    overlay: blankOverlay([...R_BROW_SUP, ...L_BROW_SUP]),
    compute: (f) => browLengthRatio(f),
  },
  {
    key: "nasalIntercanthal",
    label: "Nose width to eye gap",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.nasalIntercanthal,
    region: "nose",
    overlay: blankOverlay([R_ALARE, L_ALARE, R_CANTHUS_MED, L_CANTHUS_MED]),
    compute: (f) => nasalIntercanthal(f),
  },
  {
    key: "noseBridgeRatio",
    label: "Nose base to bridge",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.noseBridgeRatio,
    region: "nose",
    overlay: blankOverlay([R_ALARE, L_ALARE, R_NOSE_BRIDGE, L_NOSE_BRIDGE]),
    compute: (f) => noseBridgeRatio(f),
  },
  {
    key: "eyeNoseAngle",
    label: "Eye-to-nose angle",
    unit: "deg",
    area: "midface",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.eyeNoseAngle,
    region: "nose",
    overlay: blankOverlay([SUBNASALE, R_CANTHUS_LAT, L_CANTHUS_LAT]),
    compute: (f) => eyeNoseAngle(f),
  },
  {
    key: "jawFrontalAngle",
    label: "Front jaw angle",
    unit: "deg",
    area: "jawline",
    weight: 0.04,
    dimorphic: false,
    bands: BANDS.jawFrontalAngle,
    region: "jaw",
    overlay: blankOverlay([MENTON, R_GONION, L_GONION]),
    compute: (f) => jawFrontalAngle(f),
  },
  {
    key: "midfaceJawAlign",
    label: "Midface to jaw angle gap",
    unit: "deg",
    area: "jawline",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.midfaceJawAlign,
    region: "jaw",
    overlay: blankOverlay([SUBNASALE, MENTON, R_GONION, L_GONION]),
    compute: (f) => midfaceJawAlign(f),
  },
  {
    key: "cupidBowDepth",
    label: "Cupid's bow",
    unit: "ratio",
    area: "midface",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.cupidBowDepth,
    region: "mouth",
    overlay: blankOverlay([R_CUPID, L_CUPID, LABIALE_SUP]),
    compute: (f) => cupidBowDepth(f),
  },
  {
    key: "mouthToEyeWidth",
    label: "Mouth width to eye spacing",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.mouthToEyeWidth,
    region: "mouth",
    overlay: blankOverlay([R_CHEILION, L_CHEILION]),
    compute: (f) => mouthToEyeWidth(f),
  },
  {
    key: "mouthCornerHeight",
    label: "Mouth corner height",
    unit: "deg",
    area: "midface",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.mouthCornerHeight,
    region: "mouth",
    overlay: blankOverlay([R_CHEILION, L_CHEILION, STOMION_SUP]),
    compute: (f) => mouthCornerHeight(f),
  },
  {
    key: "jawSlope",
    label: "Jaw slope",
    unit: "deg",
    area: "jawline",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.jawSlope,
    region: "jaw",
    overlay: blankOverlay([R_GONION, L_GONION, MENTON]),
    compute: (f) => jawSlope(f),
  },
  {
    key: "earProtrusion",
    label: "Ear set",
    unit: "ratio",
    area: "jawline",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.earProtrusion,
    region: "jaw",
    overlay: blankOverlay([R_TRAGION, L_TRAGION, R_ZYGION, L_ZYGION]),
    compute: (f) => earProtrusion(f),
  },
  {
    key: "lipFullness",
    label: "Lip fullness",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: true,
    bands: BANDS.lipFullness,
    region: "mouth",
    vertical: true,
    overlay: blankOverlay([LABIALE_SUP, LABIALE_INF, STOMION_SUP]),
    compute: (f) => lipFullness(f),
  },
  {
    key: "cheekProminence",
    label: "Cheekbone prominence",
    unit: "ratio",
    area: "midface",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.cheekProminence,
    region: "jaw",
    overlay: blankOverlay([R_ZYGION, L_ZYGION, R_GONION, L_GONION]),
    compute: (f) => cheekProminence(f),
  },
  {
    key: "chinDefinition",
    label: "Chin definition",
    unit: "deg",
    area: "jawline",
    weight: 0.03,
    dimorphic: false,
    bands: BANDS.chinDefinition,
    region: "jaw",
    overlay: blankOverlay([MENTON, 176, 400]),
    compute: (f) => chinDefinition(f),
  },
  {
    key: "noseSymmetry",
    label: "Nose symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.noseSymmetry,
    region: "nose",
    overlay: blankOverlay([R_ALARE, L_ALARE, R_NOSE_BRIDGE, L_NOSE_BRIDGE]),
    compute: (f) => ok((pairBalance(f, R_ALARE, L_ALARE) + pairBalance(f, R_NOSE_BRIDGE, L_NOSE_BRIDGE)) / 2),
  },
  {
    key: "mouthSymmetry",
    label: "Mouth symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.mouthSymmetry,
    region: "mouth",
    overlay: blankOverlay([R_CHEILION, L_CHEILION]),
    compute: (f) => ok(pairBalance(f, R_CHEILION, L_CHEILION)),
  },
  {
    key: "browSymmetry",
    label: "Brow symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.browSymmetry,
    region: "brow",
    overlay: blankOverlay([R_BROW_PEAK, L_BROW_PEAK]),
    compute: (f) => ok(pairBalance(f, R_BROW_PEAK, L_BROW_PEAK)),
  },
  {
    key: "cheekSymmetry",
    label: "Cheekbone symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.cheekSymmetry,
    region: "jaw",
    overlay: blankOverlay([R_ZYGION, L_ZYGION]),
    compute: (f) => ok(pairBalance(f, R_ZYGION, L_ZYGION)),
  },
  {
    key: "earSymmetry",
    label: "Ear symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.earSymmetry,
    region: "jaw",
    overlay: blankOverlay([R_TRAGION, L_TRAGION]),
    compute: (f) => ok(pairBalance(f, R_TRAGION, L_TRAGION), 0.65, ["ear-proxy"]),
  },
  {
    key: "templeSymmetry",
    label: "Temple symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.templeSymmetry,
    region: "brow",
    overlay: blankOverlay([R_TEMPLE, L_TEMPLE]),
    compute: (f) => ok(pairBalance(f, R_TEMPLE, L_TEMPLE)),
  },
  {
    key: "verticalSymmetry",
    label: "Midline symmetry",
    unit: "index",
    area: "symmetry",
    weight: 0.02,
    dimorphic: false,
    bands: BANDS.verticalSymmetry,
    region: "nose",
    overlay: blankOverlay([GLABELLA, PRONASALE, SUBNASALE, MENTON]),
    compute: (f) => verticalSymmetry(f),
  },
];
