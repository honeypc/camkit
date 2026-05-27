// Pure-TypeScript Homography Solver and 2D Canvas Perspective Warper
import { PerspectivePoints } from '@camkit/types';

/**
 * Solves the system of equations Ah = b to find the 3x3 homography matrix.
 * Maps 4 source points to 4 destination points.
 * Points must be ordered: Top-Left, Top-Right, Bottom-Right, Bottom-Left
 */
export function solveHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  // Solve Ah = b using Gaussian elimination
  const h = solveSystem(A, b);
  h.push(1); // h33 = 1
  return h;
}

/**
 * Standard Gaussian elimination solver for a system of 8 linear equations.
 */
function solveSystem(A: number[][], b: number[]): number[] {
  const n = 8;
  const mat = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Pivot search
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(mat[k][i]) > Math.abs(mat[maxRow][i])) {
        maxRow = k;
      }
    }

    // Swap rows
    const temp = mat[i];
    mat[i] = mat[maxRow];
    mat[maxRow] = temp;

    // Eliminate column elements below pivot
    const pivot = mat[i][i];
    if (Math.abs(pivot) < 1e-10) {
      throw new Error('Singular matrix, points are collinear or invalid');
    }

    for (let k = i + 1; k < n; k++) {
      const factor = mat[k][i] / pivot;
      for (let j = i; j <= n; j++) {
        mat[k][j] -= factor * mat[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += mat[i][j] * x[j];
    }
    x[i] = (mat[i][n] - sum) / mat[i][i];
  }

  return x;
}

/**
 * Applies perspective correction (warping) to a Canvas based on four selected source corners.
 * Warps the enclosed quadrilateral to fill a rectangular output of specified dimensions.
 */
export function perspectiveCorrect(
  source: HTMLCanvasElement | OffscreenCanvas,
  corners: PerspectivePoints,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  let srcData: ImageData;

  if (source instanceof HTMLCanvasElement) {
    const tempCtx = source.getContext('2d') ||
                    (() => {
                      const temp = document.createElement('canvas');
                      temp.width = source.width;
                      temp.height = source.height;
                      temp.getContext('2d')!.drawImage(source, 0, 0);
                      return temp.getContext('2d')!;
                    })();
    srcData = tempCtx.getImageData(0, 0, source.width, source.height);
  } else {
    // OffscreenCanvas fallback
    const temp = document.createElement('canvas');
    temp.width = source.width;
    temp.height = source.height;
    temp.getContext('2d')!.drawImage(source as any, 0, 0);
    srcData = temp.getContext('2d')!.getImageData(0, 0, source.width, source.height);
  }

  const outData = ctx.createImageData(targetWidth, targetHeight);

  // Source corners map
  const srcPoints = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];

  // Destination corners map (output rectangle corners)
  const dstPoints = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  // Solve homography matrix mapping destination to source (for backward mapping!)
  // This avoids holes/aliasing in the target canvas
  const H = solveHomography(dstPoints, srcPoints);

  const h00 = H[0], h01 = H[1], h02 = H[2];
  const h10 = H[3], h11 = H[4], h12 = H[5];
  const h20 = H[6], h21 = H[7], h22 = H[8];

  const srcW = srcData.width;
  const srcH = srcData.height;
  const srcPixels = srcData.data;
  const outPixels = outData.data;

  // Backward mapping pixel-by-pixel with bilinear interpolation
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      // Compute projected coordinate in source
      const w = h20 * x + h21 * y + h22;
      const px = (h00 * x + h01 * y + h02) / w;
      const py = (h10 * x + h11 * y + h12) / w;

      if (px >= 0 && px < srcW - 1 && py >= 0 && py < srcH - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(px);
        const x1 = x0 + 1;
        const y0 = Math.floor(py);
        const y1 = y0 + 1;

        const dx = px - x0;
        const dy = py - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = (y * targetWidth + x) * 4;

        for (let c = 0; c < 4; c++) {
          const val =
            (1 - dx) * (1 - dy) * srcPixels[idx00 + c] +
            dx * (1 - dy) * srcPixels[idx10 + c] +
            (1 - dx) * dy * srcPixels[idx01 + c] +
            dx * dy * srcPixels[idx11 + c];

          outPixels[outIdx + c] = Math.round(val);
        }
      } else {
        // Out of bounds - transparent
        const outIdx = (y * targetWidth + x) * 4;
        outPixels[outIdx + 3] = 0;
      }
    }
  }

  ctx.putImageData(outData, 0, 0);
  return canvas;
}
