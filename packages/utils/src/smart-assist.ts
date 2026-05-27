// Smart Photo Quality Assistant & Enhancement Engine
import { SmartPhotoAssistConfig, SmartPhotoAssistResult } from '@camkit/types';

export class SmartPhotoAssist {
  public static DEFAULTS: Required<SmartPhotoAssistConfig> = {
    maxDimension: 1600,
    jpegQuality: 0.88,
    blurVarianceThreshold: 95,
    darkLuminanceThreshold: 55,
    brightPixelThreshold: 245,
    brightPixelRatioThreshold: 0.22,
    contrastStdDevThreshold: 38,
    minShortDimension: 600
  };

  /**
   * Performs real-time canvas-based analysis on captured image blobs to extract quality diagnostics.
   * Runs: Laplacian variance (blur), mean luminance (brightness), bright pixel count (overexposure),
   * std deviation (contrast), and min dimensions checks.
   */
  public static async analyze(
    imageSource: Blob | File | HTMLCanvasElement,
    options: SmartPhotoAssistConfig = {}
  ): Promise<SmartPhotoAssistResult> {
    const config = { ...this.DEFAULTS, ...options };

    // 1. Resolve source to HTMLCanvasElement
    let canvas: HTMLCanvasElement;
    if (imageSource instanceof HTMLCanvasElement) {
      canvas = imageSource;
    } else {
      canvas = await this.blobToCanvas(imageSource);
    }

    const originalW = canvas.width;
    const originalH = canvas.height;

    // 2. Perform min dimension check first
    const minDim = Math.min(originalW, originalH);
    const minResolutionHealthy = minDim >= config.minShortDimension;

    // 3. Downsample canvas to working size for analysis to ensure consistent performance
    const workingCanvas = document.createElement('canvas');
    const scale = Math.min(1, config.maxDimension / Math.max(originalW, originalH));
    workingCanvas.width = Math.round(originalW * scale);
    workingCanvas.height = Math.round(originalH * scale);

    const workingCtx = workingCanvas.getContext('2d')!;
    workingCtx.drawImage(canvas, 0, 0, workingCanvas.width, workingCanvas.height);

    const imgData = workingCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
    const pixels = imgData.data;
    const width = imgData.width;
    const height = imgData.height;
    const pixelCount = width * height;

    // 4. Calculate Grayscale and Luminance values
    const gray = new Uint8ClampedArray(pixelCount);
    let luminanceSum = 0;

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // BT.601 Grayscale / Luminance conversion formula
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = Math.round(luma);
      luminanceSum += luma;
    }

    const meanLuminance = luminanceSum / pixelCount;
    const tooDarkHealthy = meanLuminance >= config.darkLuminanceThreshold;

    // 5. Calculate Overexposure Ratio (Luminance > brightPixelThreshold)
    let overexposedPixels = 0;
    for (let i = 0; i < pixelCount; i++) {
      if (gray[i] > config.brightPixelThreshold) {
        overexposedPixels++;
      }
    }
    const overexposedRatio = overexposedPixels / pixelCount;
    const overexposedHealthy = overexposedRatio <= config.brightPixelRatioThreshold;

    // 6. Calculate Contrast (Standard Deviation of Luminance)
    let sumSquaredDiffs = 0;
    for (let i = 0; i < pixelCount; i++) {
      const diff = gray[i] - meanLuminance;
      sumSquaredDiffs += diff * diff;
    }
    const varianceLuma = sumSquaredDiffs / pixelCount;
    const stdDevLuma = Math.sqrt(varianceLuma);
    const contrastHealthy = stdDevLuma >= config.contrastStdDevThreshold;

    // 7. Calculate Laplacian Variance for Blur Check
    // Laplacian 3x3 Kernel:
    // [  0,  1,  0 ]
    // [  1, -4,  1 ]
    // [  0,  1,  0 ]
    const laplacianValues = new Float32Array((width - 2) * (height - 2));
    let laplacianSum = 0;
    let k = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIdx = y * width + x;
        const upIdx = (y - 1) * width + x;
        const downIdx = (y + 1) * width + x;
        const leftIdx = y * width + (x - 1);
        const rightIdx = y * width + (x + 1);

        const val =
          gray[upIdx] +
          gray[downIdx] +
          gray[leftIdx] +
          gray[rightIdx] -
          4 * gray[centerIdx];

        laplacianValues[k++] = val;
        laplacianSum += val;
      }
    }

    const laplacianCount = laplacianValues.length;
    const laplacianMean = laplacianSum / (laplacianCount || 1);

    let laplacianSquaredSum = 0;
    for (let i = 0; i < laplacianCount; i++) {
      const diff = laplacianValues[i] - laplacianMean;
      laplacianSquaredSum += diff * diff;
    }
    const blurVariance = laplacianSquaredSum / (laplacianCount || 1);
    const blurHealthy = blurVariance >= config.blurVarianceThreshold;

    // 8. Compile Health Checks Result Matrix
    const checks = {
      blur: { isHealthy: blurHealthy, value: blurVariance, threshold: config.blurVarianceThreshold },
      tooDark: { isHealthy: tooDarkHealthy, value: meanLuminance, threshold: config.darkLuminanceThreshold },
      overexposed: { isHealthy: overexposedHealthy, value: overexposedRatio, threshold: config.brightPixelRatioThreshold },
      lowContrast: { isHealthy: contrastHealthy, value: stdDevLuma, threshold: config.contrastStdDevThreshold },
      minResolution: { isHealthy: minResolutionHealthy, value: minDim, threshold: config.minShortDimension }
    };

    // Calculate overall scoring (ratio of passed checks)
    const passedCount =
      (blurHealthy ? 1 : 0) +
      (tooDarkHealthy ? 1 : 0) +
      (overexposedHealthy ? 1 : 0) +
      (contrastHealthy ? 1 : 0) +
      (minResolutionHealthy ? 1 : 0);

    const score = Math.round((passedCount / 5) * 100);
    const isHealthy = passedCount === 5;

    return {
      isHealthy,
      score,
      checks
    };
  }

  /**
   * Applies conservative dynamic range stretching to normalize brightness and contrast
   * without applying style-altering filters.
   */
  public static autoEnhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    const len = pixels.length;

    // Find min/max values in RGB channels (using 1% and 99% percentile thresholds for noise protection)
    const histogram = new Uint32Array(256);
    for (let i = 0; i < len; i += 4) {
      const luma = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      histogram[luma]++;
    }

    const totalPixels = len / 4;
    const threshold1 = Math.round(totalPixels * 0.01);
    const threshold99 = Math.round(totalPixels * 0.99);

    let minLuma = 0;
    let accum1 = 0;
    for (let i = 0; i < 256; i++) {
      accum1 += histogram[i];
      if (accum1 >= threshold1) {
        minLuma = i;
        break;
      }
    }

    let maxLuma = 255;
    let accum99 = 0;
    for (let i = 255; i >= 0; i--) {
      accum99 += histogram[i];
      if (accum99 >= totalPixels - threshold99) {
        maxLuma = i;
        break;
      }
    }

    const range = maxLuma - minLuma || 1;

    // Contrast stretching / normalization mapping
    for (let i = 0; i < len; i += 4) {
      pixels[i] = Math.max(0, Math.min(255, ((pixels[i] - minLuma) * 255) / range));         // Red
      pixels[i + 1] = Math.max(0, Math.min(255, ((pixels[i + 1] - minLuma) * 255) / range)); // Green
      pixels[i + 2] = Math.max(0, Math.min(255, ((pixels[i + 2] - minLuma) * 255) / range)); // Blue
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = canvas.width;
    outCanvas.height = canvas.height;
    outCanvas.getContext('2d')!.putImageData(imgData, 0, 0);

    return outCanvas;
  }

  private static blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Failed to parse Blob as Image'));
      img.src = URL.createObjectURL(blob);
    });
  }
}
