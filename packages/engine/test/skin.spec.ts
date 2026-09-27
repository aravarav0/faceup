import { describe, expect, it } from "vitest";
import { buildFrame } from "../src/normalize";
import { readSkin, skinDisks } from "../src/skin";
import type { ImageLike } from "../src/types";
import { canonicalInput, FRAME_H, FRAME_W } from "./helpers";

function paint(fill: (x: number, y: number, data: Uint8ClampedArray, p: number) => void): ImageLike {
  const data = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      fill(x, y, data, (y * FRAME_W + x) * 4);
    }
  }
  return { data, width: FRAME_W, height: FRAME_H };
}

function disk(
  img: ImageLike,
  cx: number,
  cy: number,
  r: number,
  rgb: [number, number, number],
) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(img.height - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(img.width - 1, Math.ceil(cx + r)); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const p = (y * img.width + x) * 4;
      img.data[p] = rgb[0];
      img.data[p + 1] = rgb[1];
      img.data[p + 2] = rgb[2];
      img.data[p + 3] = 255;
    }
  }
}

describe("skin read", () => {
  const disks = skinDisks(buildFrame(canonicalInput()).frame);

  it("reads an even face as calm and keeps it out of the harmony metrics", () => {
    const image = paint((x, y, data, p) => {
      const luma = 70 + (x / FRAME_W) * 160;
      data[p] = luma;
      data[p + 1] = luma - 10;
      data[p + 2] = luma - 20;
      data[p + 3] = 255;
    });
    const input = canonicalInput({ image });
    const skin = readSkin(input);
    expect(skin).toBeTruthy();
    expect(skin!.evenness).toBeGreaterThan(80);
    expect(skin!.redness).toBeLessThan(20);
    expect(skin!.shine).toBeLessThan(20);
    expect(skin!.flags).toContain("side-light");
    expect(skin!.confidence).toBeLessThan(0.7);
  });

  it("flags cheek redness and T-zone specks without calling a slow gradient uneven", () => {
    const image = paint((_x, _y, data, p) => {
      data[p] = 170;
      data[p + 1] = 140;
      data[p + 2] = 120;
      data[p + 3] = 255;
    });
    disk(image, disks.cheekR.x, disks.cheekR.y, disks.cheekR.r * 0.7, [210, 90, 80]);
    disk(image, disks.cheekL.x, disks.cheekL.y, disks.cheekL.r * 0.7, [210, 90, 80]);
    disk(image, disks.nose.x, disks.nose.y, 16, [255, 255, 255]);
    const calm = readSkin(canonicalInput({ image: paint((_x, _y, data, p) => {
      data[p] = 170;
      data[p + 1] = 140;
      data[p + 2] = 120;
      data[p + 3] = 255;
    }) }));
    const marked = readSkin(canonicalInput({ image }));
    expect(marked!.redness).toBeGreaterThan(calm!.redness + 20);
    expect(marked!.shine).toBeGreaterThan(calm!.shine + 15);
    expect(calm!.evenness).toBeGreaterThan(marked!.evenness);
    expect(marked!.flags).not.toContain("side-light");
  });
});
