import { isOpenLowBrow, type MetricKey, type MetricResult } from "@freeharmony/engine";

export interface FlawItem {
  key: MetricKey;
  headline: string;
  detail: string;
  label: string;
  score: number;
}

const MAX_FLAWS = 5;
/** Skip near-perfect reads so this list is actual gaps, not noise. */
const SCORE_CUTOFF = 90;

function thirdsLabel(m: MetricResult): { headline: string; extra: string } {
  const raw = m.detail?.thirdsPct;
  const pct = Array.isArray(raw) ? raw.map(Number) : [];
  const names = ["forehead", "midface", "lower face"] as const;
  let hi = 0;
  for (let i = 1; i < pct.length && i < names.length; i++) {
    if (pct[i]! > pct[hi]!) hi = i;
  }
  const region = names[hi] ?? "midface";
  const estimated = m.flags.includes("estimated-trichion")
    ? " The hairline is estimated, so treat this as a rough read."
    : "";
  return {
    headline:
      region === "forehead"
        ? "Long forehead"
        : region === "midface"
          ? "Long midface"
          : "Long lower face",
    extra: `The forehead, midface, and lower face aren't even in height — the ${region} takes up more of the face than the others.${estimated}`,
  };
}

function pair(
  high: boolean,
  whenHigh: [string, string],
  whenLow: [string, string],
): { headline: string; detail: string } {
  const [headline, detail] = high ? whenHigh : whenLow;
  return { headline, detail };
}

/** Plain-language read of a metric that's outside the ideal band. */
export function describeFlaw(m: MetricResult): { headline: string; detail: string } {
  const high = m.value > m.band.hi;

  switch (m.key) {
    case "canthalTilt":
      return pair(high,
        ["Strong upward eye tilt", "The outer corners of your eyes sit higher than the inner corners."],
        ["Droopy outer eye corners", "The outer corners of your eyes sit lower than the inner corners."],
      );
    case "eyeSeparationRatio":
      return pair(high,
        ["Eyes sit far apart", "Your eyes are spaced wide relative to the width of your face."],
        ["Eyes sit close together", "Your eyes are spaced close relative to the width of your face."],
      );
    case "eyeSymmetry":
      return {
        headline: "Uneven eyes",
        detail: "One eye is a different size, height, or tilt than the other.",
      };
    case "facialThirds":
      return (() => {
        const t = thirdsLabel(m);
        return { headline: t.headline, detail: t.extra };
      })();
    case "midLowerThird":
      return pair(high,
        ["Long midface vs. lower face", "From the brows to the nose is long compared to from the nose to the chin."],
        ["Long lower face vs. midface", "From the nose to the chin is long compared to from the brows to the nose."],
      );
    case "facialFifths":
      return {
        headline: "Uneven face width",
        detail: "The left and right sides of your face aren't even in width — one side or the eye region takes more space than it should.",
      };
    case "midfaceRatio":
      return pair(high,
        ["Long span from eyes to mouth", "There's a lot of vertical space between your eyes and upper lip compared to how wide the eyes are."],
        ["Short span from eyes to mouth", "Your mouth sits close to your eyes compared to how wide the eyes are."],
      );
    case "fwhr":
      return pair(high,
        ["Wide face for its height", "Your face is wide compared to the height from the eyes down to the upper lip."],
        ["Long, narrow face", "Your face is long compared to its width across the cheekbones."],
      );
    case "jawToCheekbone":
      return pair(high,
        ["Wide jaw", "Your jaw is wide compared to your cheekbones."],
        ["Narrow jaw", "Your jaw is narrow compared to your cheekbones."],
      );
    case "chinToPhiltrum":
      return pair(high,
        ["Long chin", "The chin is long compared to the space between your nose and upper lip."],
        ["Short chin", "The chin is short compared to the space between your nose and upper lip."],
      );
    case "lipRatio":
      return pair(high,
        ["Full lower lip vs. upper", "The lower lip is full compared to the upper lip."],
        ["Thin lower lip vs. upper", "The lower lip is thin compared to the upper lip."],
      );
    case "mouthToNoseWidth":
      return pair(high,
        ["Wide mouth vs. nose", "Your mouth is wide compared to your nose."],
        ["Narrow mouth vs. nose", "Your mouth is narrow compared to your nose."],
      );
    case "eyeToMouthAngle":
      return pair(high,
        ["Mouth sits high", "The mouth sits close to the eyes — a short drop from the eye line down."],
        ["Mouth sits low", "There's a long drop from the eyes down to the mouth."],
      );
    case "overallSymmetry":
      return {
        headline: "Left and right don't match",
        detail: "One side of the face is shifted or a different size than the other.",
      };
    case "jawSymmetry":
      return {
        headline: "Uneven jaw",
        detail: "The left and right sides of the jaw don't match.",
      };
    case "jawAngularity":
      return pair(high,
        ["Rounded jaw corners", "The jaw corners are more obtuse than the ideal — the jaw reads rounder, less angular."],
        ["Very sharp jaw corners", "The jaw corners are more acute than the ideal — very square."],
      );
    case "jawlineDefinition":
      return {
        headline: "Soft jawline",
        detail: "The jaw edge doesn't read as a clear line from ear to chin.",
      };
    case "browPosition":
      if (!high) {
        return {
          headline: "Natural brow height",
          detail: "Brows close to the eyes are counted as ideal.",
        };
      }
      return {
        headline: "Brows sit high",
        detail: "There's a large gap between your brows and eyes.",
      };
    default:
      return {
        headline: m.label,
        detail: high
          ? "This reading is above the ideal range."
          : "This reading is below the ideal range.",
      };
  }
}

/** Highest-scoring metrics first — the ones closest to (or inside) the ideal band. */
export function rankStrengths(
  metrics: MetricResult[],
  exclude: MetricKey[] = [],
): FlawItem[] {
  const skip = new Set(exclude);
  const ranked = metrics
    .filter((m) => !skip.has(m.key) && m.score >= 65)
    .slice()
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const excellent = ranked.filter((m) => m.score >= 85);
  return (excellent.length >= 3 ? excellent : ranked).slice(0, MAX_FLAWS).map((m) => {
    const copy = describeStrength(m);
    return {
      key: m.key,
      label: m.label,
      score: m.score,
      headline: copy.headline,
      detail: copy.detail,
    };
  });
}

function describeStrength(m: MetricResult): { headline: string; detail: string } {
  switch (m.key) {
    case "canthalTilt":
      return {
        headline: "Healthy eye tilt",
        detail: "The outer corners of your eyes sit slightly above the inner corners.",
      };
    case "eyeSeparationRatio":
      return {
        headline: "Well-spaced eyes",
        detail: "Your eyes sit a natural distance apart relative to your face width.",
      };
    case "eyeSymmetry":
      return {
        headline: "Even eyes",
        detail: "The two eyes match in size, height, and tilt.",
      };
    case "facialThirds":
      return {
        headline: "Balanced facial thirds",
        detail: "Forehead, midface, and lower face are close to even in height.",
      };
    case "midLowerThird":
      return {
        headline: "Balanced mid and lower face",
        detail: "The brows-to-nose span and the nose-to-chin span are in proportion.",
      };
    case "facialFifths":
      return {
        headline: "Even face width",
        detail: "The left and right sides of your face take up similar space.",
      };
    case "midfaceRatio":
      return {
        headline: "Balanced eye-to-mouth span",
        detail: "The vertical space from the eyes down to the upper lip sits in the ideal range.",
      };
    case "fwhr":
      return {
        headline: "Balanced face width",
        detail: "Cheekbone width vs. midface height is in the ideal range.",
      };
    case "jawToCheekbone":
      return {
        headline: "Jaw matches the cheekbones",
        detail: "Jaw width is in proportion to the cheekbones.",
      };
    case "chinToPhiltrum":
      return {
        headline: "Chin in proportion",
        detail: "Chin height matches the space between the nose and upper lip.",
      };
    case "lipRatio":
      return {
        headline: "Balanced lips",
        detail: "Lower-to-upper lip height sits in the ideal range.",
      };
    case "mouthToNoseWidth":
      return {
        headline: "Mouth matches the nose",
        detail: "Mouth width is in proportion to nose width.",
      };
    case "eyeToMouthAngle":
      return {
        headline: "Balanced eye-to-mouth angle",
        detail: "The drop from the eyes down to the mouth sits in the ideal range.",
      };
    case "overallSymmetry":
      return {
        headline: "Even left and right",
        detail: "The two sides of the face line up closely.",
      };
    case "jawSymmetry":
      return {
        headline: "Even jaw",
        detail: "The left and right sides of the jaw match.",
      };
    case "jawAngularity":
      return {
        headline: "Defined jaw corners",
        detail: "The jaw corners sit in the ideal range — not too round, not too sharp.",
      };
    case "jawlineDefinition":
      return {
        headline: "Clear jawline",
        detail: "The jaw edge reads as a distinct line from ear to chin.",
      };
    case "browPosition":
      return m.value < m.band.lo
        ? {
            headline: "Brows sit close to the eyes",
            detail: "That's counted as ideal — same as sitting in the usual range.",
          }
        : {
            headline: "Natural brow height",
            detail: "The brows sit a natural distance above the eyes.",
          };
    default:
      return {
        headline: m.label,
        detail: "This reading sits in or near the ideal range.",
      };
  }
}

/**
 * Standing vs the calibration corpus.
 *
 * Percentile P = you score at or above P% of that sample. "Top X%" is only
 * true when X ≤ 50 (you're in the upper half). Below the median, "top 56%"
 * just means 44% scored lower — it sounds strong and isn't.
 */
export function populationStanding(percentile: number): {
  rank: string;
  attractiveness: string;
} {
  const p = Math.max(0, Math.min(100, Math.round(percentile)));
  if (p > 50) {
    return {
      rank: `Top ${Math.max(1, 100 - p)}% of faces`,
      attractiveness: "above average attractiveness",
    };
  }
  if (p < 50) {
    return {
      rank: `Better than ${Math.max(1, p)}% of faces`,
      attractiveness: "below average attractiveness",
    };
  }
  return {
    rank: "Middle of the sample",
    attractiveness: "average attractiveness",
  };
}

/** Lowest-scoring metrics first — the ones furthest from the ideal band. */
export function rankFlaws(metrics: MetricResult[]): FlawItem[] {
  return metrics
    .filter((m) => m.score < SCORE_CUTOFF)
    .filter((m) => !isOpenLowBrow(m.key, m.value, m.band))
    .slice()
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, MAX_FLAWS)
    .map((m) => {
      const copy = describeFlaw(m);
      return {
        key: m.key,
        label: m.label,
        score: m.score,
        headline: copy.headline,
        detail: copy.detail,
      };
    });
}

