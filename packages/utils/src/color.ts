// Color Management System (sRGB, linear sRGB, Display-P3, Gamma)

export interface RGB {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
}

// Convert sRGB channel to Linear sRGB
export function sRGBToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Convert Linear sRGB channel to sRGB
export function linearTosRGB(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Apply full sRGB -> Linear conversion
export function rgbToLinear(rgb: RGB): RGB {
  return {
    r: sRGBToLinear(rgb.r),
    g: sRGBToLinear(rgb.g),
    b: sRGBToLinear(rgb.b),
  };
}

// Apply full Linear -> sRGB conversion
export function linearToRgb(rgb: RGB): RGB {
  return {
    r: linearTosRGB(rgb.r),
    g: linearTosRGB(rgb.g),
    b: linearTosRGB(rgb.b),
  };
}

// Gamma Correction helper (standard 2.2 curve fallback)
export function applyGamma(c: number, gamma = 2.2): number {
  return Math.pow(c, 1 / gamma);
}

export function stripGamma(c: number, gamma = 2.2): number {
  return Math.pow(c, gamma);
}

/**
 * Display-P3 to sRGB conversion (using standard linear transformation matrices)
 * Matrix maps Display-P3 Linear -> XYZ -> sRGB Linear
 */
export function displayP3ToSRGB(rgb: RGB): RGB {
  // First, convert sRGB-like gamma values of P3 to linear P3
  const rL = sRGBToLinear(rgb.r);
  const gL = sRGBToLinear(rgb.g);
  const bL = sRGBToLinear(rgb.b);

  // Conversion matrix: Display-P3 Linear to sRGB Linear
  // Ref: W3C Color HDR & Color Management
  const rS = rL * 1.2249 + gL * -0.2247 + bL * 0.002;
  const gS = rL * -0.072 + gL * 1.0719 + bL * -0.0077;
  const bS = rL * -0.018 + gL * -0.0763 + bL * 1.1343;

  // Convert back to gamma-corrected sRGB
  return {
    r: Math.max(0, Math.min(1, linearTosRGB(rS))),
    g: Math.max(0, Math.min(1, linearTosRGB(gS))),
    b: Math.max(0, Math.min(1, linearTosRGB(bS))),
  };
}

/**
 * sRGB to Display-P3 conversion
 * Matrix maps sRGB Linear -> XYZ -> Display-P3 Linear
 */
export function sRGBToDisplayP3(rgb: RGB): RGB {
  const rL = sRGBToLinear(rgb.r);
  const gL = sRGBToLinear(rgb.g);
  const bL = sRGBToLinear(rgb.b);

  // Conversion matrix: sRGB Linear to Display-P3 Linear
  const rP = rL * 0.82246 + gL * 0.17754 + bL * 0.00000;
  const gP = rL * 0.05719 + gL * 0.94281 + bL * 0.00000;
  const bP = rL * 0.01309 + gL * 0.07278 + bL * 0.91413;

  return {
    r: Math.max(0, Math.min(1, linearTosRGB(rP))),
    g: Math.max(0, Math.min(1, linearTosRGB(gP))),
    b: Math.max(0, Math.min(1, linearTosRGB(bP))),
  };
}
