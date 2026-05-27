// Geometric transformations: Crop, Rotate, Flip, Resize
import { CropRegion } from '@camkit/types';

/**
 * Rotates a source canvas by 90, 180, or 270 degrees.
 */
export function rotateCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  degrees: 90 | 180 | 270
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const angleRad = (degrees * Math.PI) / 180;
  const is90or270 = degrees === 90 || degrees === 270;

  canvas.width = is90or270 ? source.height : source.width;
  canvas.height = is90or270 ? source.width : source.height;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(angleRad);
  ctx.drawImage(source as HTMLCanvasElement, -source.width / 2, -source.height / 2);

  return canvas;
}

/**
 * Flips a source canvas horizontally, vertically, or both.
 */
export function flipCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  horizontal: boolean,
  vertical: boolean
): HTMLCanvasElement {
  if (!horizontal && !vertical) {
    // No-op copy
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d')!.drawImage(source as HTMLCanvasElement, 0, 0);
    return canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;

  ctx.translate(horizontal ? canvas.width : 0, vertical ? canvas.height : 0);
  ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1);
  ctx.drawImage(source as HTMLCanvasElement, 0, 0);

  return canvas;
}

/**
 * Crops a source canvas to a specified normalized region (0..1).
 */
export function cropCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  region: CropRegion
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const sx = Math.floor(region.x * source.width);
  const sy = Math.floor(region.y * source.height);
  const sWidth = Math.floor(region.width * source.width);
  const sHeight = Math.floor(region.height * source.height);

  canvas.width = sWidth;
  canvas.height = sHeight;

  ctx.drawImage(source as HTMLCanvasElement, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

  return canvas;
}

/**
 * Resizes a source canvas to new dimensions.
 * Optionally uses stepping (bilinear downsampling iteration) for high quality.
 */
export function resizeCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  targetWidth: number,
  targetHeight: number,
  highQuality = true
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  if (highQuality && source.width > targetWidth * 2) {
    // Stepped downsampling (iterative half-res drops to prevent aliasing)
    let currentCanvas: HTMLCanvasElement | OffscreenCanvas = source;
    let currentWidth = source.width;
    let currentHeight = source.height;

    while (currentWidth > targetWidth * 2) {
      const nextWidth = Math.floor(currentWidth / 2);
      const nextHeight = Math.floor(currentHeight / 2);

      const stepCanvas = document.createElement('canvas');
      stepCanvas.width = nextWidth;
      stepCanvas.height = nextHeight;
      stepCanvas.getContext('2d')!.drawImage(
        currentCanvas as HTMLCanvasElement,
        0,
        0,
        currentWidth,
        currentHeight,
        0,
        0,
        nextWidth,
        nextHeight
      );

      currentCanvas = stepCanvas;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
    }

    ctx.drawImage(
      currentCanvas as HTMLCanvasElement,
      0,
      0,
      currentWidth,
      currentHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );
  } else {
    // Standard direct draw
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source as HTMLCanvasElement, 0, 0, source.width, source.height, 0, 0, targetWidth, targetHeight);
  }

  return canvas;
}
