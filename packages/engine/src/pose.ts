import type { Pt } from "./types";
import { L_TRAGION, PRONASALE, R_TRAGION } from "./landmarks/indices";

export interface PoseEstimate {
  yawDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  source: "matrix" | "landmark-proxy";
  yawAsym: number;
}

/**
 * Detect whether a flat 16-float 4x4 is column-major or row-major.
 * In a rigid transform exactly one of the two candidate off-diagonal triples
 * is ~0 (the perspective row) while the other carries the translation.
 */
export function isColumnMajor(d: number[]): boolean {
  const a = Math.abs(d[3]!) + Math.abs(d[7]!) + Math.abs(d[11]!);
  const b = Math.abs(d[12]!) + Math.abs(d[13]!) + Math.abs(d[14]!);
  return a < b;
}

type Mat3 = number[][];

function rotationFromFlat(d: number[]): Mat3 {
  // Produce R[row][col] regardless of storage order.
  if (isColumnMajor(d)) {
    return [
      [d[0]!, d[4]!, d[8]!],
      [d[1]!, d[5]!, d[9]!],
      [d[2]!, d[6]!, d[10]!],
    ];
  }
  return [
    [d[0]!, d[1]!, d[2]!],
    [d[4]!, d[5]!, d[6]!],
    [d[8]!, d[9]!, d[10]!],
  ];
}

const RAD2DEG = 180 / Math.PI;

/**
 * Factor R = Rz(roll)·Ry(yaw)·Rx(pitch). Sign conventions are pinned by the
 * synthetic-rotation test in test/pose.spec.ts — do not "fix" them from docs.
 */
export function eulerFromMatrix(d: number[]): {
  pitchDeg: number;
  yawDeg: number;
  rollDeg: number;
} {
  const r = rotationFromFlat(d);
  const pitch = Math.atan2(r[2]![1]!, r[2]![2]!);
  const yaw = Math.atan2(
    -r[2]![0]!,
    Math.sqrt(r[2]![1]! * r[2]![1]! + r[2]![2]! * r[2]![2]!),
  );
  const roll = Math.atan2(r[1]![0]!, r[0]![0]!);
  return {
    pitchDeg: pitch * RAD2DEG,
    yawDeg: yaw * RAD2DEG,
    rollDeg: roll * RAD2DEG,
  };
}

/**
 * Landmark yaw proxy: x-asymmetry of the nose tip between the two tragion
 * points. Zero at zero yaw; sign matches yaw direction. Always computed as a
 * cross-check even when the matrix is present.
 */
export function yawAsymmetry(pts: Pt[]): number {
  const nose = pts[PRONASALE]!;
  const tr = pts[R_TRAGION]!;
  const tl = pts[L_TRAGION]!;
  const dR = Math.abs(nose.x - tr.x);
  const dL = Math.abs(tl.x - nose.x);
  const sum = dL + dR;
  if (sum === 0) return 0;
  return (dL - dR) / sum;
}

/**
 * Proxy→degrees factor, measured numerically on the canonical model
 * (yaw 2–12° maps at −43.2…−43.8 deg per unit asymmetry; see pose tests).
 * Negative: a positive geometric yaw pushes the nose toward the subject's
 * right tragion, making (dL − dR) negative. Sign convention against real
 * MediaPipe matrices is re-validated in the browser adapter's smoke test.
 */
export const YAW_PROXY_TO_DEG = -43.7;

/** Accept a real array, a Float32Array, or a JSON-revived {0:…,15:…} object. */
export function coerceMatrix16(m: unknown): number[] | undefined {
  if (m == null || typeof m !== "object") return undefined;
  if (!Array.isArray(m) && !ArrayBuffer.isView(m)) {
    const o = m as Record<string, unknown>;
    const arr: number[] = [];
    for (let i = 0; i < 16; i++) {
      const v = o[i] ?? o[String(i)];
      if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
      arr.push(v);
    }
    return arr;
  }
  const list = Array.from(m as ArrayLike<unknown>);
  if (list.length < 16) return undefined;
  const arr = list.slice(0, 16).map(Number);
  return arr.every(Number.isFinite) ? arr : undefined;
}

export function estimatePose(
  pts: Pt[],
  transformationMatrix: number[] | undefined,
): PoseEstimate {
  const yawAsym = yawAsymmetry(pts);
  const matrix = coerceMatrix16(transformationMatrix);
  if (matrix) {
    const e = eulerFromMatrix(matrix);
    const proxyYawDeg = yawAsym * YAW_PROXY_TO_DEG;
    // If matrix and proxy disagree in sign beyond noise, trust the proxy path.
    const disagree =
      Math.abs(e.yawDeg) > 3 &&
      Math.abs(proxyYawDeg) > 3 &&
      Math.sign(e.yawDeg) !== Math.sign(proxyYawDeg);
    if (!disagree) {
      return {
        yawDeg: e.yawDeg,
        pitchDeg: e.pitchDeg,
        rollDeg: e.rollDeg,
        source: "matrix",
        yawAsym,
      };
    }
  }
  return {
    yawDeg: yawAsym * YAW_PROXY_TO_DEG,
    pitchDeg: null,
    rollDeg: null,
    source: "landmark-proxy",
    yawAsym,
  };
}
