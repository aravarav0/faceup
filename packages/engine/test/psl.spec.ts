import { describe, expect, it } from "vitest";
import {
  pslFromScan,
  pslRatingFromHarmony,
  pslTitleOf,
} from "../src/scoring/psl";

describe("pslRatingFromHarmony", () => {
  it("hits the knots including Sub3", () => {
    expect(pslRatingFromHarmony(0)).toBe(1.0);
    expect(pslRatingFromHarmony(30)).toBe(2.0);
    expect(pslRatingFromHarmony(40)).toBe(2.9);
    expect(pslRatingFromHarmony(55)).toBe(4.0);
    expect(pslRatingFromHarmony(87)).toBe(5.5);
    expect(pslRatingFromHarmony(95)).toBe(6.0);
    expect(pslRatingFromHarmony(96.2)).toBe(6.9);
    expect(pslRatingFromHarmony(96.4)).toBe(7.0);
    expect(pslRatingFromHarmony(98.4)).toBe(8.0);
    expect(pslRatingFromHarmony(100)).toBe(8.9);
  });

  it("can rate a scored scan Sub3", () => {
    const r = pslRatingFromHarmony(45);
    expect(r).toBeLessThan(4);
    expect(pslTitleOf(r)).toBe("Sub3");
  });

  it("always returns one decimal and stays in 1.0–8.9", () => {
    for (let v = 0; v <= 100; v++) {
      const r = pslRatingFromHarmony(v);
      expect(r).toBe(Math.round(r * 10) / 10);
      expect(r).toBeGreaterThanOrEqual(1.0);
      expect(r).toBeLessThanOrEqual(8.9);
    }
  });

  it("is monotonic", () => {
    let prev = 0;
    for (let v = 0; v <= 100; v++) {
      const r = pslRatingFromHarmony(v);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe("pslTitleOf", () => {
  it("maps rating bands to PSL titles", () => {
    expect(pslTitleOf(1.0)).toBe("Sub3");
    expect(pslTitleOf(3.9)).toBe("Sub3");
    expect(pslTitleOf(4.0)).toBe("LTN");
    expect(pslTitleOf(4.9)).toBe("LTN");
    expect(pslTitleOf(5.0)).toBe("MTN");
    expect(pslTitleOf(5.5)).toBe("MTN");
    expect(pslTitleOf(6.0)).toBe("HTN");
    expect(pslTitleOf(6.9)).toBe("HTN");
    expect(pslTitleOf(7.0)).toBe("Chadlite");
    expect(pslTitleOf(8.0)).toBe("Chad");
  });
});

describe("pslFromScan", () => {
  it("returns null when the scan was refused", () => {
    expect(pslFromScan(null, 90)).toBeNull();
  });

  it("rates from harmony", () => {
    const low = pslFromScan(45, 1);
    expect(low!.title).toBe("Sub3");

    const clean = pslFromScan(96.2, 94);
    expect(clean!.title).toBe("HTN");
    expect(clean!.rating).toBe(6.9);
  });
});
