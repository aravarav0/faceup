import { describe, expect, it } from "vitest";
import { destinationCloud, frameAnchors, triangulate, buildWarpCloud, padTriangle } from "../src/lib/faceWarp";

describe("face warp", () => {
  it("covers a square with triangles that include the center", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ];
    const tris = triangulate(pts);
    expect(tris.length).toBeGreaterThanOrEqual(4);
    const used = new Set(tris.flat());
    expect(used.has(4)).toBe(true);
    for (const t of tris) {
      expect(new Set(t).size).toBe(3);
    }
  });

  it("overlaps a triangle past its corners", () => {
    const [a, b, c] = padTriangle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 2);
    expect(Math.hypot(a.x, a.y)).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(10);
    expect(c.y).toBeGreaterThan(10);
  });

  it("slides only the targeted landmark and leaves the frame anchors", () => {
    const landmarks = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
    ];
    const cloud = buildWarpCloud(landmarks, 100, 200);
    expect(cloud).toBeTruthy();
    const dst = destinationCloud(cloud!, { 1: { x: 0.9, y: 0.7 } }, 1, 100, 200);
    expect(dst[0]).toEqual({ x: 20, y: 40 });
    expect(dst[1]!.x).toBeCloseTo(90, 5);
    expect(dst[1]!.y).toBeCloseTo(140, 5);
    const anchors = frameAnchors(100, 200);
    expect(dst[dst.length - 1]).toEqual(anchors[anchors.length - 1]);
  });
});
