import { round1 } from "./scoring/curve";
import type { Frame, GateReport, ImageLike, Pt, ScanInput } from "./types";
import { buildFrame } from "./normalize";
import { pt, pupils } from "./landmarks/accessors";
import {
  GLABELLA,
  L_ZYGION,
  LABIALE_SUP,
  NASION,
  PRONASALE,
  R_ZYGION,
  TRICHION_PROXY,
} from "./landmarks/indices";

/** Photo complexion. Higher evenness is calmer tone.
 *  Higher redness is more cheek red than the forehead. Higher shine is more T-zone specks.
 *  When confidence is high enough, this is a small part of the harmony score.
 */
export interface SkinRead {
  evenness: number;
  redness: number;
  shine: number;
  /** 0–1. Blur, exposure, and one-sided light pull this down. */
  confidence: number;
  summary: string;
  flags: string[];
  /** Set once this read has been mixed into a stored overall, so it is not applied twice. */
  folded?: boolean;
}

/** Share of the harmony score given to skin, before confidence. Geometry stays the rest. */
export const SKIN_SCORE_WEIGHT = 0.12;
/** Below this, the read is shown but left out of the score. */
export const SKIN_MIN_CONFIDENCE = 0.5;

export type SkinVerdict = "Very good" | "Good" | "Fair" | "Poor";

/** 0–100. Even tone raises it; cheek redness and T-zone shine lower it. */
export function skinQuality(skin: Pick<SkinRead, "evenness" | "redness" | "shine">): number {
  const score =
    skin.evenness * 0.5 + (100 - skin.redness) * 0.25 + (100 - skin.shine) * 0.25;
  return round1(Math.max(0, Math.min(100, score)));
}

export function skinVerdict(score: number): SkinVerdict {
  if (score >= 85) return "Very good";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Poor";
}

export function skinCounts(skin: Pick<SkinRead, "confidence">): boolean {
  return skin.confidence >= SKIN_MIN_CONFIDENCE;
}

/**
 * Pull `overall` a short way toward the skin quality.
 * Returns null when the photo is too unevenly lit or too soft to trust.
 */
export function blendSkinOverall(overall: number, skin: SkinRead): number | null {
  if (!skinCounts(skin)) return null;
  const w = SKIN_SCORE_WEIGHT * skin.confidence;
  return round1((overall + w * skinQuality(skin)) / (1 + w));
}

export interface SkinDisk {
  x: number;
  y: number;
  r: number;
}

/** Image-space disks (y-down pixels) used for the skin read. */
export function skinDisks(f: Frame): {
  cheekR: SkinDisk;
  cheekL: SkinDisk;
  forehead: SkinDisk;
  nose: SkinDisk;
} {
  const { right, left } = pupils(f);
  const lip = pt(f, LABIALE_SUP);
  const cheek = (zyg: Pt, pupil: Pt): SkinDisk => {
    const c = toImage(f, zyg.x * 0.58 + pupil.x * 0.42, pupil.y * 0.42 + lip.y * 0.58);
    return { x: c[0], y: c[1], r: f.scale * 0.065 };
  };
  const g = pt(f, GLABELLA);
  const top = pt(f, TRICHION_PROXY);
  const yHair = g.y + 1.8 * (top.y - g.y);
  const fore = toImage(f, (right.x + left.x) / 2, g.y + 0.42 * (yHair - g.y));
  const nose = toImage(
    f,
    (pt(f, NASION).x + pt(f, PRONASALE).x) / 2,
    (pt(f, NASION).y + pt(f, PRONASALE).y) / 2,
  );
  return {
    cheekR: cheek(pt(f, R_ZYGION), right),
    cheekL: cheek(pt(f, L_ZYGION), left),
    forehead: { x: fore[0], y: fore[1], r: f.scale * 0.07 },
    nose: { x: nose[0], y: nose[1], r: f.scale * 0.04 },
  };
}

interface Planes {
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  luma: Float64Array;
  width: number;
  height: number;
  /** Downsample factor from the original image. */
  factor: number;
}

/**
 * Color read of cheek, forehead, and T-zone. Slow lighting is divided out first.
 * Returns null when the mesh cannot place those patches.
 */
export function readSkin(input: ScanInput, gates?: GateReport): SkinRead | null {
  if (!input.image) return null;
  if (input.landmarks.length !== 468 && input.landmarks.length !== 478) return null;
  const { frame } = buildFrame(input);
  const planes = downsample(input.image, 512);
  const blurR = Math.max(5, Math.round(0.11 * frame.scale / planes.factor));
  const blurLuma = boxMean(planes.luma, planes.width, planes.height, blurR);
  const disks = skinDisks(frame);
  const map = (d: SkinDisk) => ({
    x: d.x / planes.factor,
    y: d.y / planes.factor,
    r: Math.max(4, d.r / planes.factor),
  });

  const jawCovered = (gates?.regionConfidence.jaw ?? 1) < 0.45;
  const browCovered = (gates?.regionConfidence.brow ?? 1) < 0.45;
  const cheekR = jawCovered ? [] : sample(planes, blurLuma, map(disks.cheekR));
  const cheekL = jawCovered ? [] : sample(planes, blurLuma, map(disks.cheekL));
  const forehead = browCovered ? [] : sample(planes, blurLuma, map(disks.forehead));
  const nose = sample(planes, blurLuma, map(disks.nose));
  if (cheekR.length < 25 || cheekL.length < 25 || forehead.length < 25) return null;

  const tone = [...cheekR, ...cheekL, ...forehead].filter((p) => p.residual < 1.4 && p.residual > 0.62);
  if (tone.length < 40) return null;
  const evenness = scoreEvenness(std(tone.map((p) => p.residual)));

  const cheekRed = mean(cheekR.concat(cheekL).map((p) => p.red));
  const foreRed = mean(forehead.map((p) => p.red));
  const redness = clamp01((cheekRed - foreRed) / 0.08) * 100;

  const tzone = [...nose, ...forehead];
  const specks = tzone.filter((p) => p.residual > 1.55 && p.blur > 30 && p.blur < 235).length;
  const shine = clamp01(specks / Math.max(tzone.length, 1) / 0.05) * 100;

  const flags: string[] = [];
  let confidence = 0.82;
  const rawR = mean(cheekR.map((p) => p.luma));
  const rawL = mean(cheekL.map((p) => p.luma));
  const bias = Math.max(rawR, rawL) / Math.max(1, Math.min(rawR, rawL));
  if (bias > 1.35) {
    flags.push("side-light");
    confidence *= 0.55;
  }
  const codes = [...(gates?.blocking ?? []), ...(gates?.warnings ?? [])].map((g) => g.code);
  if (codes.some((c) => c.startsWith("blur") || c.startsWith("exposure"))) {
    flags.push("soft-photo");
    confidence *= 0.7;
  }
  if (jawCovered || browCovered) {
    flags.push("partial");
    confidence *= 0.6;
  }
  confidence = Math.max(0.15, Math.min(0.95, confidence));

  return {
    evenness: round1(evenness),
    redness: round1(redness),
    shine: round1(shine),
    confidence: Math.round(confidence * 100) / 100,
    summary: skinSummary(evenness, redness, shine, flags),
    flags,
  };
}

export function skinSummary(
  evenness: number,
  redness: number,
  shine: number,
  flags: string[],
): string {
  const bits: string[] = [];
  if (evenness >= 75) bits.push("Tone looks even across the cheeks and forehead in this photo");
  else bits.push("Tone looks uneven across the cheeks and forehead in this photo");
  if (redness >= 45) bits.push("the cheeks look redder than the forehead");
  if (shine >= 45) bits.push("the T-zone has bright specks");
  if (redness < 45 && shine < 45 && evenness >= 75) {
    bits.push("without extra cheek redness or T-zone shine");
  }
  let text = `${bits.join(", ")}.`;
  if (flags.includes("side-light")) {
    text += " One side of the face is lit more than the other, so this is less sure.";
  } else if (flags.includes("soft-photo")) {
    text += " Focus or exposure is rough, so this is less sure.";
  }
  return text;
}

interface Pix {
  luma: number;
  blur: number;
  residual: number;
  red: number;
}

function sample(planes: Planes, blurLuma: Float64Array, disk: SkinDisk): Pix[] {
  const { width, height } = planes;
  const x0 = Math.max(0, Math.floor(disk.x - disk.r));
  const x1 = Math.min(width - 1, Math.ceil(disk.x + disk.r));
  const y0 = Math.max(0, Math.floor(disk.y - disk.r));
  const y1 = Math.min(height - 1, Math.ceil(disk.y + disk.r));
  const r2 = disk.r * disk.r;
  const out: Pix[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - disk.x;
      const dy = y + 0.5 - disk.y;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * width + x;
      const luma = planes.luma[i]!;
      const blur = Math.max(1, blurLuma[i]!);
      const r = planes.r[i]!;
      const g = planes.g[i]!;
      const b = planes.b[i]!;
      out.push({
        luma,
        blur,
        residual: luma / blur,
        red: r / (g + b + 1),
      });
    }
  }
  return out;
}

function scoreEvenness(residualStd: number): number {
  return clamp01(1 - Math.max(0, residualStd - 0.012) / 0.1) * 100;
}

function std(values: number[]): number {
  const m = mean(values);
  let v = 0;
  for (const n of values) {
    const d = n - m;
    v += d * d;
  }
  return Math.sqrt(v / values.length);
}

function mean(values: number[]): number {
  let s = 0;
  for (const n of values) s += n;
  return s / values.length;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function downsample(img: ImageLike, maxLong: number): Planes {
  const long = Math.max(img.width, img.height);
  const factor = long <= maxLong ? 1 : Math.ceil(long / maxLong);
  const width = Math.max(1, Math.floor(img.width / factor));
  const height = Math.max(1, Math.floor(img.height / factor));
  const r = new Float64Array(width * height);
  const g = new Float64Array(width * height);
  const b = new Float64Array(width * height);
  const luma = new Float64Array(width * height);
  const n = factor * factor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = ((y * factor + dy) * img.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx++) {
          const p = row + dx * 4;
          rs += img.data[p] ?? 0;
          gs += img.data[p + 1] ?? 0;
          bs += img.data[p + 2] ?? 0;
        }
      }
      const i = y * width + x;
      r[i] = rs / n;
      g[i] = gs / n;
      b[i] = bs / n;
      luma[i] = (77 * r[i]! + 150 * g[i]! + 29 * b[i]!) / 256;
    }
  }
  return { r, g, b, luma, width, height, factor };
}

function boxMean(plane: Float64Array, w: number, h: number, radius: number): Float64Array {
  const ii = new Float64Array((w + 1) * (h + 1));
  const stride = w + 1;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += plane[y * w + x]!;
      ii[(y + 1) * stride + (x + 1)] = ii[y * stride + (x + 1)]! + row;
    }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const sum =
        ii[(y1 + 1) * stride + (x1 + 1)]! -
        ii[y0 * stride + (x1 + 1)]! -
        ii[(y1 + 1) * stride + x0]! +
        ii[y0 * stride + x0]!;
      out[y * w + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

function toImage(f: Frame, x: number, y: number): [number, number] {
  const theta = (f.rollDeg * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const { right, left } = pupils(f);
  const cx = (right.x + left.x) / 2;
  const cy = (right.y + left.y) / 2;
  const ux = x - cx;
  const uy = y - cy;
  const rx = cx + ux * c - uy * s;
  const ry = cy + ux * s + uy * c;
  return [rx, f.imageHeight - ry];
}
