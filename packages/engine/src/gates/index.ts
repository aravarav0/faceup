import type {
  FaceRegion,
  Frame,
  Gate,
  GateReport,
  ScanInput,
} from "../types";
import {
  FACE_OVAL,
  L_CANTHUS_LAT,
  L_CANTHUS_MED,
  L_LID_INF,
  L_LID_INF2,
  L_LID_SUP,
  L_LID_SUP2,
  R_CANTHUS_LAT,
  R_CANTHUS_MED,
  R_LID_INF,
  R_LID_INF2,
  R_LID_SUP,
  R_LID_SUP2,
} from "../landmarks/indices";
import { dx, dy, pt } from "../landmarks/accessors";
import {
  boxDownsample,
  clampRect,
  clippedFraction,
  cropGray,
  laplacianSharpness,
  toGray,
  type GrayPlane,
} from "../image/ops";
import { regionalResiduals } from "../procrustes";
import { computeJawEdgeSupport } from "../metrics/registry";

// Thresholds. Values marked CALIBRATE are first-guess constants to be
// re-anchored with the calibrate harness on a real photo corpus.
const MIN_IPD_PX = 80;
const DEGRADE_IPD_PX = 140;
const MIN_FRAME_PX = 720;
// Pose: allow a laptop camera a bit below eye level (~8–12°), but do not
// score a real looking-down / chin-tuck shot. Vertical metrics (midface,
// thirds, fWHR, chin) collapse past ~15° of pitch and produced fake Sub3
// ratings. Warn on moderate pose; refuse a true 3/4 or a steep up/down.
const YAW_FULL = 10;
const YAW_DEGRADE = 22;
const PITCH_FULL = 10;
const PITCH_DEGRADE = 16;
const ROLL_DEGRADE = 12;
const ROLL_REFUSE = 22;
// Landmark yaw-proxy magnitudes at the degree gates above
// (see YAW_PROXY_TO_DEG ≈ -43.7).
const YAW_PROXY_FULL = 0.229;
const YAW_PROXY_DEGRADE = 0.503;
const BLUR_REJECT = 0.008; // CALIBRATE
const BLUR_DEGRADE = 0.018; // CALIBRATE
const CLIP_REJECT = 0.12;
const CLIP_DEGRADE = 0.06;
const BLINK_REJECT = 0.55;
const EAR_REJECT = 0.15;
const EAR_ASYM_WARN = 0.07;
const JAW_OPEN_REJECT = 0.3;
const JAW_OPEN_WARN = 0.18;
const SMILE_REJECT = 0.45;
const SMILE_WARN = 0.28;
// Normal anatomical variation from the canonical AVERAGE face is large —
// these must only trip on landmark hallucination (hand/mask/hair), never on
// an unusual-but-visible face. Block is reserved for egregious misfits.
const RESIDUAL_BLOCK = 0.4; // CALIBRATE
const RESIDUAL_DEGRADE = 0.16; // CALIBRATE
const JAW_EDGE_MIN = 0.25; // CALIBRATE

function gate(
  code: string,
  severity: "block" | "warn",
  message: string,
  retake: string,
): Gate {
  return { code, severity, message, retake };
}

/** Eye aspect ratio; canonical open eye ≈ 0.254, closed ≈ 0.08–0.12. */
export function eyeAspectRatio(f: Frame, side: "right" | "left"): number {
  if (side === "right") {
    const h1 = dy(f, R_LID_SUP, R_LID_INF);
    const h2 = dy(f, R_LID_SUP2, R_LID_INF2);
    return (h1 + h2) / (2 * dx(f, R_CANTHUS_LAT, R_CANTHUS_MED));
  }
  const h1 = dy(f, L_LID_SUP, L_LID_INF);
  const h2 = dy(f, L_LID_SUP2, L_LID_INF2);
  return (h1 + h2) / (2 * dx(f, L_CANTHUS_MED, L_CANTHUS_LAT));
}

function faceOvalBounds(f: Frame): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const i of FACE_OVAL) {
    const p = pt(f, i);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Frame is y-up; convert to image-space y-down for pixel cropping.
  const pad = 0.1;
  const w = (maxX - minX) * (1 + 2 * pad);
  const h = (maxY - minY) * (1 + 2 * pad);
  const x = minX - (maxX - minX) * pad;
  const yTopImage = f.imageHeight - (maxY + (maxY - minY) * pad);
  return { x, y: yTopImage, w, h };
}

export function runGates(input: ScanInput, frame: Frame): GateReport {
  const blocking: Gate[] = [];
  const warnings: Gate[] = [];
  let confidenceMultiplier = 1;
  const regionConfidence: Partial<Record<FaceRegion, number>> = {};
  let jawEdgeSupport: number | null = null;

  // 4.3 — face size (IPD is in pixels of *this* buffer. Adjust Points
  // re-runs against a 768px JPEG, so the same face can drop under MIN_IPD
  // even though the live capture already passed.)
  if (frame.scale < MIN_IPD_PX) {
    if (input.reanalyze) {
      warnings.push(
        gate(
          "face-small",
          "warn",
          "Your face is a little far away; measurements are less precise.",
          "Move closer for a sharper read.",
        ),
      );
    } else {
      blocking.push(
        gate(
          "face-too-small",
          "block",
          "Your face is too small in the frame.",
          "Move closer — your face should fill most of the frame.",
        ),
      );
    }
  } else if (frame.scale < DEGRADE_IPD_PX) {
    warnings.push(
      gate(
        "face-small",
        "warn",
        "Your face is a little far away; measurements are less precise.",
        "Move closer for a sharper read.",
      ),
    );
    if (!input.reanalyze) confidenceMultiplier *= 0.8;
  }
  if (Math.min(input.imageWidth, input.imageHeight) < MIN_FRAME_PX) {
    warnings.push(
      gate(
        "low-resolution",
        "warn",
        "The photo resolution is low.",
        "Use a higher-resolution camera or photo.",
      ),
    );
    if (!input.reanalyze) confidenceMultiplier *= 0.85;
  }

  // 4.4 — pose
  const yaw = frame.yawDeg;
  if (frame.poseSource === "matrix" && yaw !== null) {
    const ay = Math.abs(yaw);
    if (ay > YAW_DEGRADE) {
      blocking.push(
        gate("yaw", "block", "Your head is turned too far to the side.", "Retake: face the camera straight on."),
      );
    } else if (ay > YAW_FULL) {
      warnings.push(
        gate("yaw-mild", "warn", "Your head is slightly turned; width measurements lose precision.", "Face the camera straight on."),
      );
      confidenceMultiplier *= 0.8;
    }
  } else {
    const ap = Math.abs(frame.yawAsym);
    if (ap > YAW_PROXY_DEGRADE) {
      blocking.push(
        gate("yaw", "block", "Your head is turned too far to the side.", "Retake: face the camera straight on."),
      );
    } else if (ap > YAW_PROXY_FULL) {
      warnings.push(
        gate("yaw-mild", "warn", "Your head is slightly turned; width measurements lose precision.", "Face the camera straight on."),
      );
      confidenceMultiplier *= 0.8;
    }
  }
  const pitch = frame.pitchDeg;
  if (pitch !== null) {
    const apitch = Math.abs(pitch);
    if (apitch > PITCH_DEGRADE) {
      blocking.push(
        gate("pitch", "block", "Your head is tilted up or down too far.", "Raise the camera to eye level and look straight at it — don't tuck your chin."),
      );
    } else if (apitch > PITCH_FULL) {
      warnings.push(
        gate("pitch-mild", "warn", "Your head is slightly tilted up or down.", "Raise the camera to eye level. You don't need to tip your chin up."),
      );
      confidenceMultiplier *= 0.8;
    }
  }
  const aroll = Math.abs(frame.rollDeg);
  if (aroll > ROLL_REFUSE) {
    blocking.push(gate("roll", "block", "Your head is tilted too far sideways.", "Keep your head level."));
  } else if (aroll > ROLL_DEGRADE) {
    warnings.push(gate("roll-mild", "warn", "Your head is slightly tilted.", "Keep your head level."));
    confidenceMultiplier *= 0.85;
  }

  // 4.7 — eyes closed: blendshapes primary, EAR cross-check.
  const bs = input.blendshapes;
  const blinkR = bs?.["eyeBlinkRight"];
  const blinkL = bs?.["eyeBlinkLeft"];
  const earR = eyeAspectRatio(frame, "right");
  const earL = eyeAspectRatio(frame, "left");
  const blendClosed =
    (blinkR !== undefined && blinkR > BLINK_REJECT) ||
    (blinkL !== undefined && blinkL > BLINK_REJECT);
  const earClosed = earR < EAR_REJECT || earL < EAR_REJECT;
  if (blendClosed || earClosed) {
    blocking.push(
      gate("eyes-closed", "block", "One or both eyes look closed.", "Keep both eyes open and look at the camera."),
    );
  } else if (Math.abs(earR - earL) > EAR_ASYM_WARN) {
    warnings.push(
      gate("eye-squint", "warn", "One eye looks like it's squinting; eye symmetry loses precision.", "Relax both eyes evenly."),
    );
    regionConfidence.eyes = Math.min(regionConfidence.eyes ?? 1, 0.6);
  }

  // 4.8 — expression
  const jawOpen = bs?.["jawOpen"];
  const smile = Math.max(bs?.["mouthSmileLeft"] ?? 0, bs?.["mouthSmileRight"] ?? 0);
  if ((jawOpen !== undefined && jawOpen > JAW_OPEN_REJECT) || smile > SMILE_REJECT) {
    blocking.push(
      gate("expression", "block", "Your expression changes the geometry being measured.", "Relax your face — lips together, neutral expression."),
    );
  } else if ((jawOpen !== undefined && jawOpen > JAW_OPEN_WARN) || smile > SMILE_WARN) {
    warnings.push(
      gate("expression-mild", "warn", "A slight smile or open jaw shifts lower-face measurements.", "Relax your face for the most accurate read."),
    );
    confidenceMultiplier *= 0.8;
  }

  // 4.9a — occlusion via regional Procrustes residuals
  const residuals = regionalResiduals(frame);
  for (const region of Object.keys(residuals.byRegion) as FaceRegion[]) {
    const r = residuals.byRegion[region];
    if (r > RESIDUAL_BLOCK) {
      blocking.push(
        gate(
          `occlusion-${region}`,
          "block",
          `Part of your face (${region}) can't be measured — something is covering it.`,
          "Pull hair back, remove glasses, and keep hands away from your face.",
        ),
      );
    } else if (r > RESIDUAL_DEGRADE) {
      warnings.push(
        gate(
          `occlusion-${region}-mild`,
          "warn",
          `The ${region} region reads as partially obscured.`,
          "Pull hair back and remove glasses for a cleaner read.",
        ),
      );
      regionConfidence[region] = Math.min(regionConfidence[region] ?? 1, 0.35);
    }
  }

  // Image-dependent gates
  if (input.image) {
    const gray = toGray(input.image);
    const bounds = clampRect(faceOvalBounds(frame), gray.width, gray.height);
    const roi = boxDownsample(cropGray(gray, bounds), 512);

    // 4.5 — blur
    const sharp = laplacianSharpness(roi);
    if (sharp < BLUR_REJECT) {
      if (input.reanalyze) {
        warnings.push(gate("blur-mild", "warn", "The stored photo is a bit soft; fine measurements lose precision.", "Hold still and tap to focus."));
      } else {
        blocking.push(gate("blur", "block", "The photo is too blurry to measure.", "Hold still and tap to focus, then retake."));
      }
    } else if (sharp < BLUR_DEGRADE) {
      warnings.push(gate("blur-mild", "warn", "The photo is slightly soft; fine measurements lose precision.", "Hold still and tap to focus."));
      if (!input.reanalyze) confidenceMultiplier *= 0.8;
    }

    // 4.6 — exposure
    const clipped = clippedFraction(roi);
    if (clipped > CLIP_REJECT) {
      if (input.reanalyze) {
        warnings.push(gate("exposure-mild", "warn", "Parts of your face are over- or under-exposed.", "Face a window with soft, even light."));
      } else {
        blocking.push(gate("exposure", "block", "The lighting is too dark or too bright.", "Face a window with soft, even light."));
      }
    } else if (clipped > CLIP_DEGRADE) {
      warnings.push(gate("exposure-mild", "warn", "Parts of your face are over- or under-exposed.", "Face a window with soft, even light."));
      if (!input.reanalyze) confidenceMultiplier *= 0.85;
    }

    // 4.9b — jaw edge support (never blocks; degrades jawline definition)
    jawEdgeSupport = computeJawEdgeSupport(frame, gray);
    if (jawEdgeSupport < JAW_EDGE_MIN) {
      warnings.push(
        gate(
          "jaw-edge-weak",
          "warn",
          "We couldn't see your jawline clearly.",
          "Try pulling your collar down and separating your chin from your neck in the frame.",
        ),
      );
      // JPEG compression routinely fails this edge check on a photo that
      // already scored. Don't null the jawline area on Adjust Points save.
      if (!input.reanalyze) {
        regionConfidence.jaw = Math.min(regionConfidence.jaw ?? 1, 0.3);
      }
    }
  }

  // Jaw edge already never blocks.

  if (input.force && blocking.length > 0) {
    for (const g of blocking) {
      warnings.push({ ...g, severity: "warn" });
      confidenceMultiplier *= 0.75;
      const occ = /^occlusion-(eyes|nose|mouth|jaw|brow)$/.exec(g.code);
      if (occ) {
        const region = occ[1] as FaceRegion;
        regionConfidence[region] = Math.min(regionConfidence[region] ?? 1, 0.4);
      }
    }
    blocking.length = 0;
    confidenceMultiplier = Math.max(0.28, confidenceMultiplier);
  }

  return {
    pass: blocking.length === 0,
    blocking,
    warnings,
    confidenceMultiplier,
    regionConfidence,
    jawEdgeSupport,
  };
}

export type { GrayPlane };
