import { describe, it, expect } from 'vitest';
import { sRGBToLinear, linearTosRGB, displayP3ToSRGB } from '../color';

describe('Color Pipeline Transformations', () => {
  it('correctly maps extreme sRGB bounds to Linear space', () => {
    expect(sRGBToLinear(0.0)).toBe(0.0);
    expect(sRGBToLinear(1.0)).toBe(1.0);
  });

  it('maintains roundtrip sRGB -> Linear -> sRGB precision', () => {
    const original = 0.45;
    const linear = sRGBToLinear(original);
    const roundtrip = linearTosRGB(linear);

    expect(roundtrip).toBeCloseTo(original, 5);
  });

  it('successfully converts pure red in Display-P3 bounds to sRGB space', () => {
    const p3Red = { r: 1.0, g: 0.0, b: 0.0 };
    const srgbRed = displayP3ToSRGB(p3Red);

    // P3 gamut is wider than sRGB, so pure P3 red is clipped/saturated in sRGB
    expect(srgbRed.r).toBe(1.0);
    expect(srgbRed.g).toBe(0.0);
    expect(srgbRed.b).toBe(0.0);
  });
});
