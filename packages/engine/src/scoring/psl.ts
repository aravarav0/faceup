import { round1 } from "./curve";

/** Short PSL-style labels attached to the 1–10 face rating. */
export type PslTitle = "Sub3" | "LTN" | "MTN" | "HTN" | "Chadlite" | "Chad";

export interface PslScore {
  /** 1.0–8.9, one decimal. The scale ends at 8; 9+ is capped. */
  rating: number;
  title: PslTitle;
}

export const PSL_TITLE_FULL: Record<PslTitle, string> = {
  Sub3: "Sub3",
  LTN: "Low Tier Normie",
  MTN: "Mid Tier Normie",
  HTN: "High Tier Normie",
  Chadlite: "Chadlite",
  Chad: "Chad",
};

/**
 * Map overall harmony % → /10, including Sub3 below 4.0.
 *
 * Top of the curve follows the attached PSL scale against the FFHQ corpus
 * (6 at ~p90 / 95% harmony, 7 at ~p95, 8 at ~p99). Bottom of the curve can
 * go Sub3: engine "needs-work" (<55) maps under 4.0.
 */
const HARMONY_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0],
  [30, 2.0],
  [40, 2.9],
  [55, 4.0],
  [70, 4.4],
  [75, 4.6],
  [85, 5.0],
  [87, 5.5],
  [95, 6.0],
  [96.4, 7.0],
  [98.4, 8.0],
  [100, 8.9],
];

/** Map a 0–100 harmony score onto the 1–10 PSL rating (1 decimal). */
export function pslRatingFromHarmony(overall: number): number {
  const v = Math.max(0, Math.min(100, overall));
  for (let i = 1; i < HARMONY_KNOTS.length; i++) {
    const [x1, r1] = HARMONY_KNOTS[i]!;
    const [x0, r0] = HARMONY_KNOTS[i - 1]!;
    if (v <= x1) {
      const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
      return round1(r0 + t * (r1 - r0));
    }
  }
  return 8.9;
}

export function pslRatingFromPercentile(percentile: number): number {
  const p = Math.max(0, Math.min(100, percentile));
  if (p <= 3) return round1(1.0 + (p / 3) * 2.0);
  if (p <= 15) return round1(3.0 + ((p - 3) / 12) * 1.0);
  if (p <= 40) return round1(4.0 + ((p - 15) / 25) * 1.0);
  if (p <= 50) return round1(5.0 + ((p - 40) / 10) * 0.5);
  if (p <= 90) return round1(5.5 + ((p - 50) / 40) * 0.5);
  if (p <= 95) return round1(6.0 + ((p - 90) / 5) * 1.0);
  if (p <= 99) return round1(7.0 + ((p - 95) / 4) * 1.0);
  return round1(8.0 + ((p - 99) / 1) * 0.9);
}

export function pslTitleOf(rating: number): PslTitle {
  if (rating < 4) return "Sub3";
  if (rating < 5) return "LTN";
  if (rating < 6) return "MTN";
  if (rating < 7) return "HTN";
  if (rating < 8) return "Chadlite";
  return "Chad";
}

/**
 * Face rating from a scan's overall harmony.
 * Returns null when the scan was refused.
 */
export function pslFromScan(
  overall: number | null,
  _overallPercentile?: number | null,
): PslScore | null {
  if (overall === null) return null;
  const rating = pslRatingFromHarmony(overall);
  return { rating, title: pslTitleOf(rating) };
}
