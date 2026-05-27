// Canvas2D CPU Fallback Engine for Image Processing
import { AdjustmentParams } from '@camkit/types';

export class Canvas2DFallback {
  /**
   * Applies brightness, contrast, exposure, and saturation adjustments on the CPU.
   */
  public static process(
    source: HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
    adjustments: AdjustmentParams
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(source as HTMLCanvasElement, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    const len = pixels.length;

    // Pre-calculate factor scales
    const brightness = (adjustments.brightness ?? 0) * 2.55; // convert -100..100 to -255..255
    const contrast = ((adjustments.contrast ?? 0) + 100) / 100; // convert -100..100 to 0..2
    const exposure = Math.pow(2, (adjustments.exposure ?? 0) / 100);
    const saturation = ((adjustments.saturation ?? 0) + 100) / 100; // convert -100..100 to 0..2

    const contrastFactor = Math.pow((contrast + 1) / 1, 2); // contrast math adjustment

    for (let i = 0; i < len; i += 4) {
      let r = pixels[i];
      let g = pixels[i + 1];
      let b = pixels[i + 2];

      // 1. Exposure
      r *= exposure;
      g *= exposure;
      b *= exposure;

      // 2. Brightness
      r += brightness;
      g += brightness;
      b += brightness;

      // 3. Contrast
      if (contrast !== 1) {
        r = (r / 255 - 0.5) * contrastFactor + 0.5;
        g = (g / 255 - 0.5) * contrastFactor + 0.5;
        b = (b / 255 - 0.5) * contrastFactor + 0.5;

        r *= 255;
        g *= 255;
        b *= 255;
      }

      // 4. Saturation
      if (saturation !== 1) {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        r = luma + (r - luma) * saturation;
        g = luma + (g - luma) * saturation;
        b = luma + (b - luma) * saturation;
      }

      // Clamp values to 0..255
      pixels[i] = Math.max(0, Math.min(255, r));
      pixels[i + 1] = Math.max(0, Math.min(255, g));
      pixels[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
}
