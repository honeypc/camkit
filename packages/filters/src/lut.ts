// Trilinear 3D Look-Up Table (.cube) Parser & Interpolator
export interface LUT3D {
  size: number;
  data: Float32Array; // Size: 3 * size^3
}

/**
 * Parses standard .cube 3D LUT files.
 */
export function parseCubeLUT(fileContent: string): LUT3D {
  const lines = fileContent.split('\n');
  let size = 0;
  const rgbData: number[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }

    // Parse floats on each color line
    const match = line.split(/\s+/);
    if (match.length === 3) {
      const r = parseFloat(match[0]);
      const g = parseFloat(match[1]);
      const b = parseFloat(match[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        rgbData.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    throw new Error('Invalid .cube format: LUT_3D_SIZE not found');
  }

  const expectedLength = size * size * size * 3;
  if (rgbData.length < expectedLength) {
    throw new Error(`LUT parsing incomplete: expected ${expectedLength} points, parsed ${rgbData.length}`);
  }

  return {
    size,
    data: new Float32Array(rgbData.slice(0, expectedLength)),
  };
}

/**
 * Applies a 3D LUT using high-performance trilinear interpolation.
 * Receives raw pixel colors [r, g, b] in range 0..255, returns modified [r, g, b] in range 0..255.
 */
export function lookupLUT(lut: LUT3D, r: number, g: number, b: number): [number, number, number] {
  const size = lut.size;
  const data = lut.data;

  // Normalize color input to index coordinates (0 to size - 1)
  const x = (r / 255) * (size - 1);
  const y = (g / 255) * (size - 1);
  const z = (b / 255) * (size - 1);

  // Voxel floor indices
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);

  // Voxel ceiling indices
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const z1 = Math.min(z0 + 1, size - 1);

  // Interpolation factors
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;

  // Flat array index helper
  const getVal = (ix: number, iy: number, iz: number): [number, number, number] => {
    // Standard cube layout mapping
    const idx = (iz * size * size + iy * size + ix) * 3;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  // Get color at 8 corners of the voxel
  const c000 = getVal(x0, y0, z0);
  const c100 = getVal(x1, y0, z0);
  const c010 = getVal(x0, y1, z0);
  const c110 = getVal(x1, y1, z0);
  const c001 = getVal(x0, y0, z1);
  const c101 = getVal(x1, y0, z1);
  const c011 = getVal(x0, y1, z1);
  const c111 = getVal(x1, y1, z1);

  // Trilinear interpolation loop for R, G, B channels
  const outRGB: [number, number, number] = [0, 0, 0];

  for (let c = 0; c < 3; c++) {
    // Interpolate along X
    const c00 = c000[c] * (1 - fx) + c100[c] * fx;
    const c01 = c001[c] * (1 - fx) + c101[c] * fx;
    const c10 = c010[c] * (1 - fx) + c110[c] * fx;
    const c11 = c011[c] * (1 - fx) + c111[c] * fx;

    // Interpolate along Y
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    // Interpolate along Z
    const finalVal = c0 * (1 - fz) + c1 * fz;
    outRGB[c] = Math.round(finalVal * 255);
  }

  return outRGB;
}

/**
 * Applies a 3D LUT to an entire Canvas ImageData block.
 */
export function applyLUTToImageData(imgData: ImageData, lut: LUT3D) {
  const pixels = imgData.data;
  const len = pixels.length;

  for (let i = 0; i < len; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const [nr, ng, nb] = lookupLUT(lut, r, g, b);

    pixels[i] = nr;
    pixels[i + 1] = ng;
    pixels[i + 2] = nb;
  }
}
