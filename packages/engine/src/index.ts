import type {
  AreaKey,
  GateReport,
  MetricResult,
  ScanInput,
  ScanResult,
} from "./types";
import { buildFrame } from "./normalize";
import { runGates } from "./gates/index";
import { METRICS } from "./metrics/registry";
import { resolveBand } from "./scoring/bands";
import { isOpenLowBrow, scoreAgainstBand, verdictOf } from "./scoring/curve";
import { aggregate } from "./scoring/aggregate";
import {
  overallPercentileOf,
  percentileOf,
  standardizedOverall,
} from "./scoring/norms";

export const ENGINE_VERSION = "0.1.0";

const EMPTY_AREAS: Record<AreaKey, { score: null; confidence: number }> = {
  symmetry: { score: null, confidence: 0 },
  eyeArea: { score: null, confidence: 0 },
  midface: { score: null, confidence: 0 },
  jawline: { score: null, confidence: 0 },
};

/**
 * The engine's single entry point. Deterministic: identical input produces a
 * byte-identical result. No DOM, no I/O, no randomness, no clock.
 */
export function analyze(input: ScanInput): ScanResult {
  const sex = input.sex ?? "neutral";
  const bandProfile = input.bandProfile ?? "faceharmony-parity";

  if (input.landmarks.length !== 468 && input.landmarks.length !== 478) {
    const gates: GateReport = {
      pass: false,
      blocking: [
        {
          code: "no-face",
          severity: "block",
          message: "No face detected.",
          retake: "Center your face in the frame with good lighting.",
        },
      ],
      warnings: [],
      confidenceMultiplier: 1,
      regionConfidence: {},
      jawEdgeSupport: null,
    };
    return {
      ok: false,
      gates,
      frame: null,
      metrics: [],
      areas: { ...EMPTY_AREAS },
      overall: null,
      overallPercentile: null,
      standardized: null,
      tier: null,
      engineVersion: ENGINE_VERSION,
      bandProfile,
      sex,
    };
  }

  const { frame } = buildFrame(input);
  const gates = runGates(input, frame);

  if (!gates.pass) {
    return {
      ok: false,
      gates,
      frame,
      metrics: [],
      areas: { ...EMPTY_AREAS },
      overall: null,
      overallPercentile: null,
      standardized: null,
      tier: null,
      engineVersion: ENGINE_VERSION,
      bandProfile,
      sex,
    };
  }

  const ctx = {
    image: input.image ?? null,
    gates,
    sex,
    hasIris: frame.hasIris,
  };

  const pitchUnknown = frame.pitchDeg === null;
  const metrics: MetricResult[] = [];
  const weights: Record<string, { area: AreaKey; weight: number }> = {};

  for (const def of METRICS) {
    const computed = def.compute(frame, ctx);
    if (computed === null) continue;
    let confidence = computed.confidence * gates.confidenceMultiplier;
    const regionCap = gates.regionConfidence[def.region];
    if (regionCap !== undefined) confidence = Math.min(confidence, regionCap);
    if (def.vertical && pitchUnknown) confidence = Math.min(confidence, 0.55);
    if (
      def.vertical &&
      frame.pitchDeg !== null &&
      Math.abs(frame.pitchDeg) > 8
    ) {
      // Looking down/up stretches midface, chin, and fWHR. Don't let those
      // bogus values dominate the rollup.
      const extra = Math.min(1, (Math.abs(frame.pitchDeg) - 8) / 10);
      confidence *= 1 - 0.75 * extra;
    }
    confidence = Math.max(0, Math.min(1, confidence));

    const band = resolveBand(def.bands[bandProfile], sex);
    const score = scoreAgainstBand(def.key, computed.value, band);
    metrics.push({
      key: def.key,
      label: def.label,
      value: computed.value,
      unit: def.unit,
      band,
      score,
      verdict: verdictOf(score),
      confidence,
      flags: computed.flags ?? [],
      percentile: percentileOf(def.key, computed.value),
      detail: computed.detail,
    });
    weights[def.key] = { area: def.area, weight: def.weight };
  }

  const agg = aggregate(metrics, weights);
  const refused = agg.overall === null;

  return {
    ok: !refused,
    gates: refused
      ? {
          ...gates,
          pass: false,
          blocking: [
            ...gates.blocking,
            {
              code: "insufficient-data",
              severity: "block",
              message: "Too much of the face couldn't be measured reliably.",
              retake: "Retake with even lighting, no occlusions, facing straight on.",
            },
          ],
        }
      : gates,
    frame,
    metrics,
    areas: agg.areas,
    overall: agg.overall,
    overallPercentile:
      agg.overall !== null && bandProfile === "calibrated"
        ? overallPercentileOf(agg.overall)
        : null,
    standardized:
      agg.overall !== null && bandProfile === "calibrated"
        ? standardizedOverall(agg.overall)
        : null,
    tier: agg.tier,
    engineVersion: ENGINE_VERSION,
    bandProfile,
    sex,
  };
}

/**
 * Older scans scored low-set brows as a miss. Re-rate those rows as ideal and
 * rebuild the rollup so the overall number matches a fresh scan.
 */
export function applyLowBrowIdeal(result: ScanResult): ScanResult {
  if (!result.ok || result.metrics.length === 0) return result;
  let changed = false;
  const metrics = result.metrics.map((m) => {
    if (!isOpenLowBrow(m.key, m.value, m.band)) return m;
    if (m.score === 100 && m.verdict === "ideal") return m;
    changed = true;
    return { ...m, score: 100, verdict: "ideal" as const };
  });
  if (!changed) return result;

  const weights: Record<string, { area: AreaKey; weight: number }> = {};
  for (const def of METRICS) {
    weights[def.key] = { area: def.area, weight: def.weight };
  }
  const agg = aggregate(metrics, weights);
  return {
    ...result,
    metrics,
    areas: agg.areas,
    overall: agg.overall,
    overallPercentile:
      agg.overall !== null && result.bandProfile === "calibrated"
        ? overallPercentileOf(agg.overall)
        : result.overallPercentile,
    standardized:
      agg.overall !== null && result.bandProfile === "calibrated"
        ? standardizedOverall(agg.overall)
        : result.standardized,
    tier: agg.tier,
  };
}

// Public surface
export * from "./types";
export { buildFrame } from "./normalize";
export { runGates, eyeAspectRatio } from "./gates/index";
export { METRICS, TRICHION_K, computeJawEdgeSupport } from "./metrics/registry";
export { BANDS, resolveBand } from "./scoring/bands";
export {
  subScore,
  scoreAgainstBand,
  isOpenLowBrow,
  verdictOf,
  round1,
} from "./scoring/curve";
export {
  percentileOf,
  overallPercentileOf,
  standardizedOverall,
  overallScoreStats,
  NORMS_META,
} from "./scoring/norms";
export {
  pslFromScan,
  pslRatingFromPercentile,
  pslTitleOf,
  PSL_TITLE_FULL,
} from "./scoring/psl";
export type { PslScore, PslTitle } from "./scoring/psl";
export { AREA_WEIGHTS, AREA_LABELS, aggregate, tierOf } from "./scoring/aggregate";
export * as LANDMARKS from "./landmarks/indices";
export {
  analyzeProfile,
  defaultProfileAnchors,
  profileFacing,
  PROFILE_ANCHOR_LABELS,
  PROFILE_ANCHOR_ORDER,
} from "./profile";
export type {
  ProfileAnchor,
  ProfileAnchorKey,
  ProfileAnchors,
  ProfileMetricKey,
  ProfileMetricResult,
} from "./profile";
export { CANONICAL_VERTS } from "./landmarks/canonical";
export { regionalResiduals } from "./procrustes";
export {
  coerceMatrix16,
  estimatePose,
  eulerFromMatrix,
  isColumnMajor,
  yawAsymmetry,
  YAW_PROXY_TO_DEG,
} from "./pose";
