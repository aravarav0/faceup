import { describe, expect, it } from "vitest";
import { LANDMARKS } from "@freeharmony/engine";
import { pinJaw, spreadJaw } from "../src/lib/jawSpread";

const chain = [
  234, 93, 132, 58,
  ...LANDMARKS.MANDIBLE_CONTOUR,
  288, 361, 323, 454,
];

function cloud(): { x: number; y: number }[] {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.4 }));
  chain.forEach((id, i) => {
    pts[id] = { x: i / (chain.length - 1), y: 0.7 + Math.sin((i / (chain.length - 1)) * Math.PI) * 0.2 };
  });
  pts[17] = { x: 0.5, y: 0.62 };
  pts[18] = { x: 0.5, y: 0.66 };
  pts[200] = { x: 0.5, y: 0.72 };
  pts[199] = { x: 0.5, y: 0.78 };
  pts[175] = { x: 0.5, y: 0.84 };
  pts[140] = { x: 0.42, y: 0.8 };
  pts[171] = { x: 0.46, y: 0.86 };
  return pts;
}

describe("jaw spread", () => {
  it("carries the chin contour with the chin tip", () => {
    const pts = cloud();
    const tip = pts[LANDMARKS.MENTON]!;
    const out = spreadJaw(pts, { [LANDMARKS.MENTON]: { x: tip.x, y: tip.y + 0.08 } });
    const beside = pts[148]!;
    expect(out[148]!.y - beside.y).toBeGreaterThan(0.05);
    expect(out[LANDMARKS.R_GONION]).toBeUndefined();
    expect(out[136]!.y - pts[136]!.y).toBeLessThan(out[148]!.y - beside.y);
    expect(out[175]!.y).toBeGreaterThan(pts[175]!.y);
    expect(out[140]!.y - pts[140]!.y).toBeGreaterThan(0.03);
    expect(out[171]!.y - pts[171]!.y).toBeGreaterThan(0.04);
  });

  it("carries the jaw side when a jaw angle moves", () => {
    const pts = cloud();
    const g = pts[LANDMARKS.R_GONION]!;
    const out = spreadJaw(pts, { [LANDMARKS.R_GONION]: { x: g.x - 0.06, y: g.y } });
    expect(out[136]!.x).toBeLessThan(pts[136]!.x - 0.02);
    expect(out[58]!.x).toBeLessThan(pts[58]!.x);
    expect(out[LANDMARKS.MENTON]).toBeUndefined();
  });

  it("adds neck pins that follow the chin partway", () => {
    const pts = cloud();
    const tip = pts[LANDMARKS.MENTON]!;
    const field = pinJaw(pts, { [LANDMARKS.MENTON]: { x: tip.x, y: tip.y + 0.08 } });
    expect(field.points.length).toBeGreaterThan(pts.length);
    const below = field.points.findIndex((p, i) => i >= pts.length && p && p.y > tip.y + 0.02);
    expect(below).toBeGreaterThanOrEqual(pts.length);
    const pin = field.points[below]!;
    const dest = field.targets[below]!;
    expect(dest.y).toBeGreaterThan(pin.y + 0.005);
    expect(dest.y - pin.y).toBeLessThan(0.08);
  });

  it("leaves a morph alone when the jaw did not move", () => {
    const pts = cloud();
    const nose = { 1: { x: 0.5, y: 0.3 } };
    expect(spreadJaw(pts, nose)).toBe(nose);
  });
});
