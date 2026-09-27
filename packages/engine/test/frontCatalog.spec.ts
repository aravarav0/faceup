import { describe, expect, it } from "vitest";
import { analyze } from "../src/index";
import { canonicalInput } from "./helpers";

describe("front catalog", () => {
  const result = analyze(canonicalInput());

  it("adds the front measurements and keeps a score", () => {
    expect(result.ok).toBe(true);
    const keys = [
      "totalFaceRatio",
      "bitemporalWidth",
      "cheekboneHeight",
      "eyeAspect",
      "oneEyeApart",
      "eyebrowTilt",
      "browLengthRatio",
      "nasalIntercanthal",
      "noseBridgeRatio",
      "eyeNoseAngle",
      "jawFrontalAngle",
      "midfaceJawAlign",
      "cupidBowDepth",
      "mouthToEyeWidth",
      "mouthCornerHeight",
      "jawSlope",
      "earProtrusion",
      "lipFullness",
      "cheekProminence",
      "chinDefinition",
      "noseSymmetry",
      "mouthSymmetry",
      "browSymmetry",
      "cheekSymmetry",
      "earSymmetry",
      "templeSymmetry",
      "verticalSymmetry",
    ];
    for (const key of keys) {
      const m = result.metrics.find((x) => x.key === key);
      expect(m, key).toBeTruthy();
      expect(Number.isFinite(m!.value), key).toBe(true);
      expect(m!.score, key).toBeGreaterThan(40);
    }
    expect(result.overall).not.toBeNull();
  });
});
