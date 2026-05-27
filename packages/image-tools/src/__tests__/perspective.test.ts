import { describe, it, expect } from 'vitest';
import { solveHomography } from '../perspective';

describe('Perspective Warp Homography Solver', () => {
  it('correctly solves identity mapping systems (zero displacement mapping)', () => {
    // Top-Left, Top-Right, Bottom-Right, Bottom-Left
    const src = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const dst = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    const h = solveHomography(src, dst);

    // For identity transformation, the homography matrix is the identity matrix:
    // [1, 0, 0]
    // [0, 1, 0]
    // [0, 0, 1]
    expect(h[0]).toBeCloseTo(1, 2); // h00
    expect(h[1]).toBeCloseTo(0, 2); // h01
    expect(h[2]).toBeCloseTo(0, 2); // h02
    expect(h[3]).toBeCloseTo(0, 2); // h10
    expect(h[4]).toBeCloseTo(1, 2); // h11
    expect(h[5]).toBeCloseTo(0, 2); // h12
    expect(h[6]).toBeCloseTo(0, 2); // h20
    expect(h[7]).toBeCloseTo(0, 2); // h21
    expect(h[8]).toBeCloseTo(1, 2); // h22 (fixed to 1)
  });
});
