import type { Band, BandProfile, BandSet, MetricKey, Sex } from "../types";

/**
 * Ideal bands per metric, per profile.
 *
 * 'faceharmony-parity' — the bands observed in the source app's own UI
 *   (see research UI-SPEC §2.2). Kept for comparison with the original.
 * 'literature' — bands from the aesthetics/orthodontic literature digest.
 *   These use DIFFERENT measurement conventions for some metrics (notably
 *   jaw-to-cheekbone) and must never be blended with parity values.
 * 'calibrated' — the app default: parity's aesthetic centers, except where
 *   the FFHQ calibration corpus (n=592 gate-passing faces) proved an anchor
 *   sat in a measurement-convention mismatch, plus falloff scales set to the
 *   corpus's robust SD (IQR/1.349) so "score 50" ≈ one population-SD outside
 *   the band. Derived by scripts/calibrate.ts; see norms.json meta.
 */
const RAW_BANDS: Record<MetricKey, Record<"faceharmony-parity" | "literature", BandSet>> = {
  canthalTilt: {
    "faceharmony-parity": { lo: 1, hi: 7, sLo: 4, sHi: 4 },
    literature: { lo: 2, hi: 6, sLo: 4, sHi: 4 },
  },
  eyeSeparationRatio: {
    "faceharmony-parity": { lo: 0.443, hi: 0.474 },
    literature: { lo: 0.45, hi: 0.48 },
  },
  eyeSymmetry: {
    "faceharmony-parity": { lo: 92, hi: 100, sLo: 9 },
    literature: { lo: 92, hi: 100, sLo: 9 },
  },
  facialThirds: {
    "faceharmony-parity": { lo: 0.9, hi: 1, sLo: 0.1 },
    literature: { lo: 0.9, hi: 1, sLo: 0.1 },
  },
  midLowerThird: {
    "faceharmony-parity": { lo: 0.92, hi: 1.08 },
    literature: { lo: 0.92, hi: 1.08 },
  },
  facialFifths: {
    "faceharmony-parity": { lo: 0.85, hi: 1, sLo: 0.13 },
    literature: { lo: 0.85, hi: 1, sLo: 0.13 },
  },
  midfaceRatio: {
    "faceharmony-parity": { lo: 0.94, hi: 1, sLo: 0.06, sHi: 0.06 },
    literature: { lo: 0.94, hi: 1, sLo: 0.06, sHi: 0.06 },
  },
  fwhr: {
    "faceharmony-parity": {
      masculine: { lo: 1.8, hi: 2.05, sLo: 0.18, sHi: 0.18 },
      feminine: { lo: 1.65, hi: 1.9, sLo: 0.18, sHi: 0.18 },
    },
    literature: {
      masculine: { lo: 1.8, hi: 2.0, sLo: 0.18, sHi: 0.18 },
      feminine: { lo: 1.65, hi: 1.9, sLo: 0.18, sHi: 0.18 },
    },
  },
  jawToCheekbone: {
    "faceharmony-parity": {
      masculine: { lo: 0.855, hi: 0.92 },
      feminine: { lo: 0.8, hi: 0.875 },
    },
    // Literature convention uses a different denominator — genuinely a
    // different quantity. Never blend with the parity band.
    literature: {
      masculine: { lo: 0.7, hi: 0.8 },
      feminine: { lo: 0.68, hi: 0.78 },
    },
  },
  chinToPhiltrum: {
    "faceharmony-parity": { lo: 2.05, hi: 2.55 },
    literature: { lo: 2.0, hi: 2.4 },
  },
  lipRatio: {
    "faceharmony-parity": { lo: 1.5, hi: 1.8, sLo: 0.3, sHi: 0.25 },
    // Preference studies now often favor ~1:1 — the low side is forgiving.
    literature: { lo: 1.0, hi: 1.6, sLo: 0.35, sHi: 0.25 },
  },
  mouthToNoseWidth: {
    "faceharmony-parity": { lo: 1.38, hi: 1.53 },
    literature: { lo: 1.38, hi: 1.53 },
  },
  eyeToMouthAngle: {
    "faceharmony-parity": { lo: 45, hi: 49, sLo: 2, sHi: 2 },
    literature: { lo: 45, hi: 49, sLo: 2, sHi: 2 },
  },
  overallSymmetry: {
    "faceharmony-parity": { lo: 88, hi: 100, sLo: 10 },
    literature: { lo: 88, hi: 100, sLo: 10 },
  },
  jawSymmetry: {
    "faceharmony-parity": { lo: 88, hi: 100, sLo: 10 },
    literature: { lo: 88, hi: 100, sLo: 10 },
  },
  jawAngularity: {
    "faceharmony-parity": {
      masculine: { lo: 122, hi: 145, sLo: 14, sHi: 14 },
      feminine: { lo: 130, hi: 152, sLo: 14, sHi: 14 },
    },
    literature: {
      masculine: { lo: 122, hi: 145, sLo: 14, sHi: 14 },
      feminine: { lo: 130, hi: 152, sLo: 14, sHi: 14 },
    },
  },
  jawlineDefinition: {
    "faceharmony-parity": { lo: 0.62, hi: 1, sLo: 0.28 },
    literature: { lo: 0.62, hi: 1, sLo: 0.28 },
  },
  browPosition: {
    "faceharmony-parity": {
      masculine: { lo: 0.2, hi: 0.28 },
      feminine: { lo: 0.26, hi: 0.36 },
    },
    literature: {
      masculine: { lo: 0.2, hi: 0.28 },
      feminine: { lo: 0.26, hi: 0.36 },
    },
  },
  // Front-only additions. Ranges are aesthetic centers, not FaceIQ's
  // unpublished weights. Low-set brows stay on browPosition (open below the floor).
  totalFaceRatio: {
    "faceharmony-parity": { lo: 1.42, hi: 1.72 },
    literature: { lo: 1.42, hi: 1.72 },
  },
  bitemporalWidth: {
    "faceharmony-parity": { lo: 1.05, hi: 1.35 },
    literature: { lo: 1.05, hi: 1.35 },
  },
  cheekboneHeight: {
    "faceharmony-parity": { lo: 0.05, hi: 0.5 },
    literature: { lo: 0.05, hi: 0.5 },
  },
  eyeAspect: {
    "faceharmony-parity": { lo: 2.6, hi: 4.6 },
    literature: { lo: 2.6, hi: 4.6 },
  },
  oneEyeApart: {
    "faceharmony-parity": { lo: 1.2, hi: 1.65 },
    literature: { lo: 1.2, hi: 1.65 },
  },
  eyebrowTilt: {
    "faceharmony-parity": {
      masculine: { lo: -4, hi: 14, sLo: 6, sHi: 6 },
      feminine: { lo: 0, hi: 18, sLo: 6, sHi: 6 },
    },
    literature: {
      masculine: { lo: -4, hi: 14, sLo: 6, sHi: 6 },
      feminine: { lo: 0, hi: 18, sLo: 6, sHi: 6 },
    },
  },
  browLengthRatio: {
    "faceharmony-parity": { lo: 0.58, hi: 0.82 },
    literature: { lo: 0.58, hi: 0.82 },
  },
  nasalIntercanthal: {
    "faceharmony-parity": { lo: 0.75, hi: 1.05 },
    literature: { lo: 0.75, hi: 1.05 },
  },
  noseBridgeRatio: {
    "faceharmony-parity": { lo: 1.6, hi: 2.6 },
    literature: { lo: 1.6, hi: 2.6 },
  },
  eyeNoseAngle: {
    "faceharmony-parity": { lo: 72, hi: 100, sLo: 10, sHi: 10 },
    literature: { lo: 72, hi: 100, sLo: 10, sHi: 10 },
  },
  jawFrontalAngle: {
    "faceharmony-parity": { lo: 108, hi: 140, sLo: 12, sHi: 12 },
    literature: { lo: 108, hi: 140, sLo: 12, sHi: 12 },
  },
  midfaceJawAlign: {
    "faceharmony-parity": { lo: 22, hi: 52, sLo: 10, sHi: 10 },
    literature: { lo: 22, hi: 52, sLo: 10, sHi: 10 },
  },
  cupidBowDepth: {
    "faceharmony-parity": { lo: 0.005, hi: 0.07 },
    literature: { lo: 0.005, hi: 0.07 },
  },
  mouthToEyeWidth: {
    "faceharmony-parity": { lo: 0.65, hi: 0.95 },
    literature: { lo: 0.65, hi: 0.95 },
  },
  mouthCornerHeight: {
    "faceharmony-parity": { lo: -16, hi: 6, sLo: 6, sHi: 6 },
    literature: { lo: -16, hi: 6, sLo: 6, sHi: 6 },
  },
  jawSlope: {
    "faceharmony-parity": { lo: 48, hi: 76, sLo: 10, sHi: 10 },
    literature: { lo: 48, hi: 76, sLo: 10, sHi: 10 },
  },
  earProtrusion: {
    "faceharmony-parity": { lo: 0.02, hi: 0.16, sLo: 0.05, sHi: 0.05 },
    literature: { lo: 0.02, hi: 0.16, sLo: 0.05, sHi: 0.05 },
  },
  lipFullness: {
    "faceharmony-parity": {
      masculine: { lo: 0.16, hi: 0.32 },
      feminine: { lo: 0.2, hi: 0.38 },
    },
    literature: {
      masculine: { lo: 0.16, hi: 0.32 },
      feminine: { lo: 0.2, hi: 0.38 },
    },
  },
  cheekProminence: {
    "faceharmony-parity": { lo: 0.04, hi: 0.16 },
    literature: { lo: 0.04, hi: 0.16 },
  },
  chinDefinition: {
    "faceharmony-parity": { lo: 140, hi: 175, sLo: 12, sHi: 12 },
    literature: { lo: 140, hi: 175, sLo: 12, sHi: 12 },
  },
  noseSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
  mouthSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
  browSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
  cheekSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
  earSymmetry: {
    "faceharmony-parity": { lo: 80, hi: 100, sLo: 12 },
    literature: { lo: 80, hi: 100, sLo: 12 },
  },
  templeSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
  verticalSymmetry: {
    "faceharmony-parity": { lo: 85, hi: 100, sLo: 10 },
    literature: { lo: 85, hi: 100, sLo: 10 },
  },
};

/**
 * Corpus-derived re-anchors. These three bands were provably anchored in a
 * different measurement convention than the engine's (band edges landed at
 * population percentiles [1,11], [92,100], and [3,36] respectively on the
 * FFHQ corpus). Centers re-derived from the corpus median; widths kept
 * comparable to the aesthetic-band tradition.
 */
const CALIBRATED_BAND_OVERRIDES: Partial<Record<MetricKey, BandSet>> = {
  eyeSeparationRatio: { lo: 0.485, hi: 0.515 },
  facialFifths: { lo: 0.72, hi: 1 },
  eyeToMouthAngle: { lo: 45.5, hi: 50.5 },
  jawSymmetry: { lo: 84, hi: 100 },
};

/** Robust SD (IQR/1.349) per metric from the FFHQ corpus — falloff scales. */
const CALIBRATED_S: Record<MetricKey, number> = {
  canthalTilt: 2.32,
  eyeSeparationRatio: 0.02,
  eyeSymmetry: 1.86,
  facialThirds: 0.062,
  midLowerThird: 0.089,
  facialFifths: 0.075,
  midfaceRatio: 0.082,
  fwhr: 0.167,
  jawToCheekbone: 0.029,
  chinToPhiltrum: 0.407,
  lipRatio: 0.349,
  mouthToNoseWidth: 0.19,
  eyeToMouthAngle: 3.31,
  overallSymmetry: 5.39,
  jawSymmetry: 10.33,
  jawAngularity: 3.06,
  // No corpus signal (needs image pixels) — keeps its hand-set scale.
  jawlineDefinition: 0.28,
  browPosition: 0.045,
  totalFaceRatio: 0.08,
  bitemporalWidth: 0.04,
  cheekboneHeight: 0.1,
  eyeAspect: 0.45,
  oneEyeApart: 0.08,
  eyebrowTilt: 6,
  browLengthRatio: 0.06,
  nasalIntercanthal: 0.08,
  noseBridgeRatio: 0.25,
  eyeNoseAngle: 10,
  jawFrontalAngle: 12,
  midfaceJawAlign: 8,
  cupidBowDepth: 0.02,
  mouthToEyeWidth: 0.1,
  mouthCornerHeight: 3,
  jawSlope: 8,
  earProtrusion: 0.04,
  lipFullness: 0.05,
  cheekProminence: 0.04,
  chinDefinition: 15,
  noseSymmetry: 10,
  mouthSymmetry: 10,
  browSymmetry: 10,
  cheekSymmetry: 10,
  earSymmetry: 12,
  templeSymmetry: 10,
  verticalSymmetry: 10,
};

function withS(b: Band, s: number): Band {
  return { lo: b.lo, hi: b.hi, sLo: s, sHi: s };
}

function buildCalibrated(key: MetricKey): BandSet {
  const base = CALIBRATED_BAND_OVERRIDES[key] ?? RAW_BANDS[key]["faceharmony-parity"];
  const s = CALIBRATED_S[key];
  if ("masculine" in base) {
    return {
      masculine: withS(base.masculine, s),
      feminine: withS(base.feminine, s),
    };
  }
  return withS(base, s);
}

export const BANDS: Record<MetricKey, Record<BandProfile, BandSet>> = Object.fromEntries(
  (Object.keys(RAW_BANDS) as MetricKey[]).map((k) => [
    k,
    { ...RAW_BANDS[k], calibrated: buildCalibrated(k) },
  ]),
) as Record<MetricKey, Record<BandProfile, BandSet>>;

/**
 * Resolve a possibly-dimorphic band for the given sex.
 * Neutral = the UNION of both bands, deliberately generous: declining to
 * declare a sex costs the user nothing.
 */
export function resolveBand(bs: BandSet, sex: Sex): Band {
  if (!("masculine" in bs)) return bs;
  if (sex === "masculine") return bs.masculine;
  if (sex === "feminine") return bs.feminine;
  const m = bs.masculine;
  const f = bs.feminine;
  const mHalf = (m.hi - m.lo) / 2;
  const fHalf = (f.hi - f.lo) / 2;
  return {
    lo: Math.min(m.lo, f.lo),
    hi: Math.max(m.hi, f.hi),
    sLo: ((m.sLo ?? mHalf) + (f.sLo ?? fHalf)) / 2,
    sHi: ((m.sHi ?? mHalf) + (f.sHi ?? fHalf)) / 2,
  };
}
